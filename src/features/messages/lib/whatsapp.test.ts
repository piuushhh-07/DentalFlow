import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MessageLogStatus } from "@prisma/client";

import {
  assertWhatsAppConsent,
  buildDefaultReminderMessage,
  buildWhatsAppLink,
  InvalidWhatsAppPhoneError,
  isManuallyConfirmedMessageStatus,
  isSameManualReminderSubmission,
  isWhatsAppConsentValid,
  validateManualSendConfirmation,
  WhatsAppConsentRequiredError,
  toWhatsAppNumber,
} from "@/features/messages/lib/whatsapp";

describe("WhatsApp reminder safeguards", () => {
  it("formats validated Indian mobile numbers as wa.me digits", () => {
    assert.equal(toWhatsAppNumber("+91 (98765) 43210"), "919876543210");
    assert.throws(
      () => toWhatsAppNumber("+1 212 555 0100"),
      InvalidWhatsAppPhoneError,
    );
  });

  it("URL-encodes editable text including punctuation and Unicode", () => {
    const link = new URL(
      buildWhatsAppLink("+91 98765 43210", "Hi, Anu! Visit: 16 Oct 😊"),
    );
    assert.equal(link.origin + link.pathname, "https://wa.me/919876543210");
    assert.equal(link.searchParams.get("text"), "Hi, Anu! Visit: 16 Oct 😊");
  });

  it("builds a neutral default without treatment or diagnosis details", () => {
    const message = buildDefaultReminderMessage({
      patientName: "Anu",
      clinicName: "DentalFlow Clinic",
      dueDate: "16 Oct 2026",
      clinicPhone: "+91 98765 43210",
    });
    assert.match(message, /Anu/);
    assert.match(message, /DentalFlow Clinic/);
    assert.match(message, /16 Oct 2026/);
    assert.match(message, /\+91 98765 43210/);
    assert.doesNotMatch(message, /root canal|diagnosis|implant/i);
  });

  it("requires both opt-in and a recorded consent timestamp", () => {
    assert.equal(
      isWhatsAppConsentValid({
        whatsappOptIn: true,
        whatsappOptedInAt: new Date(),
      }),
      true,
    );
    assert.equal(
      isWhatsAppConsentValid({
        whatsappOptIn: true,
        whatsappOptedInAt: null,
      }),
      false,
    );
    assert.equal(
      isWhatsAppConsentValid({
        whatsappOptIn: false,
        whatsappOptedInAt: new Date(),
      }),
      false,
    );
    assert.throws(
      () =>
        assertWhatsAppConsent({
          whatsappOptIn: false,
          whatsappOptedInAt: null,
        }),
      WhatsAppConsentRequiredError,
    );
  });

  it("requires an explicit confirmation and distinguishes opening from reported sending", () => {
    assert.equal(validateManualSendConfirmation("on"), true);
    assert.equal(validateManualSendConfirmation(null), false);
    assert.equal(validateManualSendConfirmation("true"), false);
    assert.equal(
      isManuallyConfirmedMessageStatus(MessageLogStatus.OPENED_IN_WHATSAPP),
      false,
    );
    assert.equal(
      isManuallyConfirmedMessageStatus(MessageLogStatus.MANUALLY_RECORDED_SENT),
      true,
    );
  });

  it("accepts an idempotent retry only for the same actor, record and snapshot", () => {
    const input = {
      senderUserId: "user-1",
      kind: "treatment-visit" as const,
      relatedRecordId: "visit-1",
      message: "Hello, this is a reminder.",
      templateId: null,
    };
    const existing = {
      senderUserId: "user-1",
      patientId: "patient-1",
      treatmentVisitId: "visit-1",
      preventiveRecallId: null,
      messageTemplateId: null,
      messageSnapshot: input.message,
      status: MessageLogStatus.MANUALLY_RECORDED_SENT,
      manuallyConfirmedSentAt: new Date(),
    };
    assert.equal(
      isSameManualReminderSubmission(existing, input, "patient-1"),
      true,
    );
    assert.equal(
      isSameManualReminderSubmission(
        existing,
        { ...input, message: "Changed content" },
        "patient-1",
      ),
      false,
    );
    assert.equal(
      isSameManualReminderSubmission(
        { ...existing, status: MessageLogStatus.OPENED_IN_WHATSAPP },
        input,
        "patient-1",
      ),
      false,
    );
  });
});
