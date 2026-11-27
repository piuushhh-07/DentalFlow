import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import {
  canRetryWhatsAppDeliveryFailure,
  getWhatsAppCloudApiConfig,
  sendWhatsAppTemplateMessage,
  WhatsAppDeliveryError,
} from "@/features/messages/lib/whatsapp-cloud-api";

const config = {
  token: "test-token",
  phoneNumberId: "123456789012",
  templateName: "appointment_reminder",
  templateLanguage: "en",
  graphApiVersion: "v22.0",
  cronSecret: "x".repeat(32),
};

describe("WhatsApp Cloud API provider contract", () => {
  it("sends the expected template payload with a bounded request signal", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        assert.equal(init?.method, "POST");
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer test-token",
        );
        assert.ok(init?.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);

        const payload = JSON.parse(String(init?.body));
        assert.equal(payload.messaging_product, "whatsapp");
        assert.equal(payload.to, "919876543210");
        assert.equal(payload.template.name, "appointment_reminder");
        assert.deepEqual(
          payload.template.components[0].parameters.map(
            (parameter: { text: string }) => parameter.text,
          ),
          ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
        );

        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.test-message" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );

    try {
      const messageId = await sendWhatsAppTemplateMessage(config, {
        phoneNumber: "+91 98765 43210",
        parameters: ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
      });
      assert.equal(messageId, "wamid.test-message");
      assert.equal(fetchMock.mock.callCount(), 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("converts provider errors into a safe delivery error", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code: 131000 } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );

    try {
      await assert.rejects(
        sendWhatsAppTemplateMessage(config, {
          phoneNumber: "9876543210",
          parameters: ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
        }),
        (error: unknown) => {
          assert.ok(error instanceof WhatsAppDeliveryError);
          assert.equal(error.httpStatus, 400);
          assert.equal(error.providerCode, "131000");
          return true;
        },
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("rejects a successful HTTP response without a provider message id", async () => {
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    try {
      await assert.rejects(
        sendWhatsAppTemplateMessage(config, {
          phoneNumber: "9876543210",
          parameters: ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
        }),
        WhatsAppDeliveryError,
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("classifies provider request timeouts without exposing the original error", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new DOMException("request timed out", "TimeoutError");
    });

    try {
      await assert.rejects(
        sendWhatsAppTemplateMessage(config, {
          phoneNumber: "9876543210",
          parameters: ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
        }),
        (error: unknown) => {
          assert.ok(error instanceof WhatsAppDeliveryError);
          assert.equal(error.httpStatus, 0);
          assert.equal(error.providerCode, "TIMEOUT");
          assert.equal(
            error.message,
            "Meta WhatsApp Business message delivery failed.",
          );
          return true;
        },
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("classifies network failures separately from provider HTTP errors", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new TypeError("network unavailable");
    });

    try {
      await assert.rejects(
        sendWhatsAppTemplateMessage(config, {
          phoneNumber: "9876543210",
          parameters: ["Anu", "DentalFlow Clinic", "16 Nov, 10:30 am"],
        }),
        (error: unknown) => {
          assert.ok(error instanceof WhatsAppDeliveryError);
          assert.equal(error.httpStatus, 0);
          assert.equal(error.providerCode, "NETWORK_ERROR");
          return true;
        },
      );
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe("WhatsApp delivery retry classification", () => {
  it("retries definitive provider client errors", () => {
    assert.equal(canRetryWhatsAppDeliveryFailure("400:131000"), true);
    assert.equal(canRetryWhatsAppDeliveryFailure("401:4"), true);
  });

  it("does not immediately retry provider rate limits without backoff metadata", () => {
    assert.equal(canRetryWhatsAppDeliveryFailure("429:4"), false);
  });

  it("does not retry failures with an unknown delivery outcome", () => {
    assert.equal(canRetryWhatsAppDeliveryFailure("0:TIMEOUT"), false);
    assert.equal(canRetryWhatsAppDeliveryFailure("0:NETWORK_ERROR"), false);
    assert.equal(canRetryWhatsAppDeliveryFailure("500:2"), false);
    assert.equal(canRetryWhatsAppDeliveryFailure("DELIVERY_ERROR"), false);
    assert.equal(
      canRetryWhatsAppDeliveryFailure("ELIGIBILITY_CHANGED_BEFORE_DELIVERY"),
      false,
    );
    assert.equal(canRetryWhatsAppDeliveryFailure(null), false);
  });
});


describe("WhatsApp Cloud API configuration", () => {
  it("does not require a cron secret to validate provider delivery settings", () => {
    const keys = [
      "WHATSAPP_CLOUD_API_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_BUSINESS_TEMPLATE_NAME",
      "WHATSAPP_TEMPLATE_LANGUAGE",
      "WHATSAPP_GRAPH_API_VERSION",
      "WHATSAPP_CRON_SECRET",
    ] as const;
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );

    try {
      process.env.WHATSAPP_CLOUD_API_TOKEN = "test-token";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789012";
      process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME = "appointment_reminder";
      process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en";
      process.env.WHATSAPP_GRAPH_API_VERSION = "v22.0";
      delete process.env.WHATSAPP_CRON_SECRET;

      const config = getWhatsAppCloudApiConfig();
      assert.equal(config.token, "test-token");
      assert.equal(config.phoneNumberId, "123456789012");
      assert.equal("cronSecret" in config, false);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
