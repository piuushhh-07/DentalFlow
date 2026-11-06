import { z } from "zod";

import { toWhatsAppNumber } from "@/features/messages/lib/whatsapp";

const configSchema = z.object({
  token: z.string().min(1),
  phoneNumberId: z.string().regex(/^\d{6,30}$/),
  templateName: z.string().regex(/^[a-z0-9_]{1,120}$/),
  templateLanguage: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
  graphApiVersion: z.string().regex(/^v\d+\.\d+$/),
  cronSecret: z.string().min(32),
});

export class WhatsAppConfigurationError extends Error {
  constructor(readonly missingOrInvalid: readonly string[]) {
    super("Meta WhatsApp Business delivery is not configured.");
    this.name = "WhatsAppConfigurationError";
  }
}

export class WhatsAppDeliveryError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly providerCode: string,
  ) {
    super("Meta WhatsApp Business message delivery failed.");
    this.name = "WhatsAppDeliveryError";
  }
}

export function getWhatsAppCloudApiConfig() {
  const parsed = configSchema.safeParse({
    token: process.env.WHATSAPP_CLOUD_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    templateName: process.env.WHATSAPP_BUSINESS_TEMPLATE_NAME,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en",
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? "v22.0",
    cronSecret: process.env.WHATSAPP_CRON_SECRET,
  });
  if (!parsed.success) {
    throw new WhatsAppConfigurationError([
      ...Array.from(
        new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
      ),
    ]);
  }
  return parsed.data;
}

export function buildWhatsAppTemplateParameters(input: {
  patientName: string;
  clinicName: string;
  appointmentTime: string;
}): string[] {
  return [
    input.patientName,
    input.clinicName,
    input.appointmentTime,
  ];
}

export async function sendWhatsAppTemplateMessage(
  config: ReturnType<typeof getWhatsAppCloudApiConfig>,
  input: {
    phoneNumber: string;
    parameters: readonly string[];
  },
): Promise<string> {
  const to = toWhatsAppNumber(input.phoneNumber);
  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            {
              type: "body",
              parameters: input.parameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  const providerResponseSchema = z.object({
    messages: z.array(z.object({ id: z.string().min(1) })).optional(),
    error: z
      .object({
        code: z.union([z.number(), z.string()]).optional(),
      })
      .optional(),
  });
  const parsed = providerResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success || !parsed.data.messages?.[0]?.id) {
    const providerCode = parsed.success
      ? String(parsed.data.error?.code ?? "INVALID_RESPONSE")
      : "INVALID_RESPONSE";
    throw new WhatsAppDeliveryError(response.status, providerCode);
  }
  return parsed.data.messages[0].id;
}
