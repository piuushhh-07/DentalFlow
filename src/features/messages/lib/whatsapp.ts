import { MessageLogStatus } from "@prisma/client";

import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  renderMessageTemplate,
} from "@/features/messages/lib/template-validation";

export class InvalidWhatsAppPhoneError extends Error {
  constructor() {
    super("A valid Indian mobile number is required.");
    this.name = "InvalidWhatsAppPhoneError";
  }
}

export class WhatsAppConsentRequiredError extends Error {
  constructor() {
    super("Recorded WhatsApp consent is required for reminders.");
    this.name = "WhatsAppConsentRequiredError";
  }
}

export const DEFAULT_REMINDER_TEMPLATE = DEFAULT_WHATSAPP_TEMPLATE;

export function toWhatsAppNumber(phoneNumber: string): string {
  const normalized = normalizeIndianPhoneNumber(phoneNumber);
  if (!normalized) throw new InvalidWhatsAppPhoneError();
  return normalized.slice(1);
}

export function buildWhatsAppLink(
  phoneNumber: string,
  message: string,
): string {
  const number = toWhatsAppNumber(phoneNumber);
  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    throw new Error("A reminder message is required.");
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(normalizedMessage)}`;
}

export function buildDefaultReminderMessage(input: {
  patientName: string;
  clinicName: string;
  dueDate: string;
  clinicPhone: string;
}): string {
  return renderMessageTemplate(DEFAULT_REMINDER_TEMPLATE, {
    patient_name: input.patientName,
    clinic_name: input.clinicName,
    due_date: input.dueDate,
    clinic_phone: input.clinicPhone,
  });
}

export function isWhatsAppConsentValid(patient: {
  whatsappOptIn: boolean;
  whatsappOptedInAt: Date | null;
}): boolean {
  return patient.whatsappOptIn && patient.whatsappOptedInAt !== null;
}

export function assertWhatsAppConsent(patient: {
  whatsappOptIn: boolean;
  whatsappOptedInAt: Date | null;
}): void {
  if (!isWhatsAppConsentValid(patient)) {
    throw new WhatsAppConsentRequiredError();
  }
}

export function validateManualSendConfirmation(
  confirmation: string | null,
): boolean {
  return confirmation === "on";
}

export function isManuallyConfirmedMessageStatus(
  status: MessageLogStatus,
): boolean {
  return status === MessageLogStatus.MANUALLY_RECORDED_SENT;
}

export function isSameManualReminderSubmission(
  existing: Readonly<{
    senderUserId: string;
    patientId: string;
    treatmentVisitId: string | null;
    preventiveRecallId: string | null;
    messageTemplateId: string | null;
    messageSnapshot: string;
    status: MessageLogStatus;
    manuallyConfirmedSentAt: Date | null;
  }>,
  input: Readonly<{
    senderUserId: string;
    kind: "treatment-visit" | "preventive-recall";
    relatedRecordId: string;
    message: string;
    templateId: string | null;
  }>,
  patientId: string,
): boolean {
  return (
    existing.senderUserId === input.senderUserId &&
    existing.patientId === patientId &&
    existing.treatmentVisitId ===
      (input.kind === "treatment-visit" ? input.relatedRecordId : null) &&
    existing.preventiveRecallId ===
      (input.kind === "preventive-recall" ? input.relatedRecordId : null) &&
    existing.messageTemplateId === input.templateId &&
    existing.messageSnapshot === input.message &&
    existing.status === MessageLogStatus.MANUALLY_RECORDED_SENT &&
    existing.manuallyConfirmedSentAt !== null
  );
}
