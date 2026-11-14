import { z } from "zod";

import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";

const normalizedPhoneSchema = z
  .string()
  .trim()
  .min(1, "Enter an Indian mobile number.")
  .transform((phone, context) => {
    const normalized = normalizeIndianPhoneNumber(phone);

    if (!normalized) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Indian mobile number.",
      });
      return z.NEVER;
    }

    return normalized;
  });

export const patientInputSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160),
    phoneNumber: normalizedPhoneSchema,
    email: z
      .union([z.literal(""), z.string().trim().email().max(254)])
      .default("")
      .transform((email) => (email ? email.toLowerCase() : null)),
    portalAccessEnabled: z.boolean().default(false),
    whatsappOptIn: z.boolean(),
    notes: z
      .string()
      .trim()
      .max(5000)
      .transform((notes) => notes || null),
  })
  .refine(
    (patient) => !patient.portalAccessEnabled || patient.email !== null,
    {
      path: ["email"],
      message: "Add an email address before enabling portal access.",
    },
  )
  .transform((patient) => ({
    ...patient,
    whatsappOptedInAt: patient.whatsappOptIn ? new Date() : null,
    portalAccessEnabledAt: patient.portalAccessEnabled ? new Date() : null,
  }));

export function resolvePatientEnabledAtTimestamp(
  enabled: boolean,
  wasPreviouslyEnabled: boolean,
  previousTimestamp: Date | null,
  newlyRecordedTimestamp: Date,
): Date | null {
  if (!enabled) {
    return null;
  }

  if (wasPreviouslyEnabled && previousTimestamp) {
    return previousTimestamp;
  }

  return newlyRecordedTimestamp;
}

export type PatientInput = z.output<typeof patientInputSchema>;

export const patientIdSchema = z.string().uuid();

export const patientSearchSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

export const PATIENT_PAGE_SIZE = 10;

export function formatIndianPhoneNumber(phoneNumber: string): string {
  const normalized = normalizeIndianPhoneNumber(phoneNumber);

  if (!normalized) {
    return phoneNumber;
  }

  return `${normalized.slice(0, 3)} ${normalized.slice(3, 8)} ${normalized.slice(8)}`;
}

export function getPatientPagination(
  totalCount: number,
  requestedPage: number,
  pageSize = PATIENT_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    skip: (page - 1) * pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

export function patientBelongsToClinic(
  patient: Readonly<{ clinicId: string }> | null,
  clinicId: string,
): boolean {
  return patient !== null && patient.clinicId === clinicId;
}

export function hasDuplicatePatientPhoneError(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002" ||
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null ||
    !("target" in error.meta)
  ) {
    return false;
  }

  const target = error.meta.target;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some(
    (field) =>
      typeof field === "string" &&
      (field.includes("normalizedPhone") ||
        field.includes("clinicId_normalizedPhone")),
  );
}

export class PatientWhatsAppConsentRequiredError extends Error {
  constructor() {
    super("WhatsApp follow-up requires recorded patient consent.");
    this.name = "PatientWhatsAppConsentRequiredError";
  }
}

export function assertPatientWhatsAppConsent(
  patient: Readonly<{ whatsappOptIn: boolean; whatsappOptedInAt: Date | null }>,
): void {
  if (!patient.whatsappOptIn || !patient.whatsappOptedInAt) {
    throw new PatientWhatsAppConsentRequiredError();
  }
}
