import { buildWhatsAppTemplateParameters } from "@/features/messages/lib/whatsapp-cloud-api";

export function buildWhatsAppReminderContent(input: {
  patientName: string;
  clinicName: string;
  timeZone: string;
  scheduledAt: Date;
  templateName: string;
  templateLanguage: string;
}) {
  const appointmentTime = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: input.timeZone,
  }).format(input.scheduledAt);
  const parameters = buildWhatsAppTemplateParameters({
    patientName: input.patientName,
    clinicName: input.clinicName,
    appointmentTime,
  });

  return {
    appointmentTime,
    parameters,
    messageSnapshot: JSON.stringify({
      template: input.templateName,
      language: input.templateLanguage,
      parameters,
    }),
  };
}
