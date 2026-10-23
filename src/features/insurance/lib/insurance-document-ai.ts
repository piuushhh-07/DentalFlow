import { z } from "zod";

import { amountToPaise } from "@/features/insurance/lib/insurance-validation";

export const insuranceExtractionFieldNames = [
  "patientName",
  "providerName",
  "policyNumber",
  "memberReference",
  "validFrom",
  "validUntil",
  "treatmentDate",
  "treatmentDescription",
  "estimatedCost",
  "amountClaimed",
  "coverageLimit",
  "deductible",
  "coPaymentPercent",
  "coverageNotes",
  "exclusions",
] as const;

export const insuranceExtractionFieldsSchema = z
  .object({
    patientName: z.string().trim().max(180).nullable(),
    providerName: z.string().trim().max(180).nullable(),
    policyNumber: z.string().trim().max(120).nullable(),
    memberReference: z.string().trim().max(120).nullable(),
    validFrom: z.string().trim().max(40).nullable(),
    validUntil: z.string().trim().max(40).nullable(),
    treatmentDate: z.string().trim().max(40).nullable(),
    treatmentDescription: z.string().trim().max(2000).nullable(),
    estimatedCost: z.string().trim().max(40).nullable(),
    amountClaimed: z.string().trim().max(40).nullable(),
    coverageLimit: z.string().trim().max(40).nullable(),
    deductible: z.string().trim().max(40).nullable(),
    coPaymentPercent: z.string().trim().max(40).nullable(),
    coverageNotes: z.string().trim().max(5000).nullable(),
    exclusions: z.string().trim().max(5000).nullable(),
    currencyCode: z.enum(["INR", "OTHER", "UNKNOWN"]),
  })
  .strict();

export const insuranceDocumentExtractionSchema = z
  .object({
    pageCount: z.number().int().min(1).max(1000),
    fields: insuranceExtractionFieldsSchema,
    sources: z
      .array(
        z
          .object({
            field: z.enum(insuranceExtractionFieldNames),
            page: z.number().int().min(1).max(1000),
            quote: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const insurancePolicyAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(3000),
    citations: z
      .array(
        z
          .object({
            page: z.number().int().min(1).max(1000),
            quote: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .max(30),
    unknowns: z.array(z.string().trim().min(1).max(400)).max(20),
  })
  .strict();

export const insuranceClaimSummarySourcesSchema = z.array(
  z
    .object({
      documentId: z.string().uuid(),
      field: z.enum(insuranceExtractionFieldNames),
      page: z.number().int().min(1).max(1000),
      quote: z.string().trim().min(1).max(600),
    })
    .strict(),
);

export type InsuranceDocumentExtraction = z.infer<
  typeof insuranceDocumentExtractionSchema
>;
export type InsuranceExtractionFields = z.infer<
  typeof insuranceExtractionFieldsSchema
>;
export type InsurancePolicyAnswer = z.infer<typeof insurancePolicyAnswerSchema>;

export type InsuranceSourceContext = Readonly<{
  patientName?: string;
  providerName?: string;
  policyNumber?: string;
  policyValidFrom?: string;
  policyValidUntil?: string;
  treatmentDate?: string;
  estimatedCost?: string;
  amountClaimed?: string;
}>;

export type InsuranceExtractionCheck = Readonly<{
  missingFields: readonly string[];
  issues: readonly string[];
}>;

export type InsuranceClaimSummaryContext = InsuranceSourceContext &
  Readonly<{
    patientName: string;
    providerName: string;
    policyNumber: string;
    policyValidFrom: string;
    policyValidUntil: string;
    treatmentDate: string;
    estimatedCost: string;
    amountClaimed: string;
  }>;

const requiredFieldsByDocument = {
  POLICY_COPY: ["policyNumber", "providerName", "validFrom", "validUntil"],
  TREATMENT_ESTIMATE: [
    "patientName",
    "treatmentDescription",
    "treatmentDate",
    "estimatedCost",
  ],
  TREATMENT_PLAN: ["patientName", "treatmentDescription"],
  CLAIM_FORM: ["patientName", "policyNumber", "amountClaimed"],
  INVOICE: ["patientName", "treatmentDate", "amountClaimed"],
  PRESCRIPTION: ["patientName", "treatmentDate", "treatmentDescription"],
  DIAGNOSTIC_REPORT: ["patientName", "treatmentDate"],
  DISCHARGE_SUMMARY: ["patientName", "treatmentDate", "treatmentDescription"],
  OTHER: [],
} as const;

const dateFields = ["validFrom", "validUntil", "treatmentDate"] as const;
const amountFields = [
  "estimatedCost",
  "amountClaimed",
  "coverageLimit",
  "deductible",
] as const;

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function compareText(
  label: string,
  actual: string | null,
  expected: string | undefined,
  issues: string[],
): void {
  if (
    actual &&
    expected &&
    normalizedText(actual) !== normalizedText(expected)
  ) {
    issues.push(`${label} does not match the selected clinic record.`);
  }
}

export function validateInsuranceExtraction(
  documentType: keyof typeof requiredFieldsByDocument,
  extraction: InsuranceDocumentExtraction,
  context: InsuranceSourceContext = {},
): InsuranceExtractionCheck {
  const missingFields = requiredFieldsByDocument[documentType].filter(
    (field) => !extraction.fields[field],
  );
  const issues: string[] = [];
  const sourcesByField = new Set(extraction.sources.map(({ field }) => field));

  for (const field of insuranceExtractionFieldNames) {
    const value = extraction.fields[field];
    if (value && !sourcesByField.has(field)) {
      issues.push(`A source-page citation is missing for ${field}.`);
    }
  }
  for (const source of extraction.sources) {
    if (source.page > extraction.pageCount) {
      issues.push("A citation refers to a page outside the document.");
    }
  }

  for (const field of dateFields) {
    const value = extraction.fields[field];
    if (value && !isCalendarDate(value)) {
      issues.push(`${field} is not a valid YYYY-MM-DD date.`);
    }
  }
  for (const field of amountFields) {
    const value = extraction.fields[field];
    if (value) {
      try {
        amountToPaise(value);
      } catch {
        issues.push(`${field} is not a valid INR amount.`);
      }
    }
  }
  if (
    extraction.fields.coPaymentPercent &&
    (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(
      extraction.fields.coPaymentPercent,
    ) ||
      Number(extraction.fields.coPaymentPercent) > 100)
  ) {
    issues.push("Co-payment must be between 0 and 100 percent.");
  }
  if (
    extraction.fields.validFrom &&
    extraction.fields.validUntil &&
    isCalendarDate(extraction.fields.validFrom) &&
    isCalendarDate(extraction.fields.validUntil) &&
    extraction.fields.validFrom > extraction.fields.validUntil
  ) {
    issues.push("Policy start date is after its end date.");
  }
  if (extraction.fields.amountClaimed && extraction.fields.estimatedCost) {
    try {
      if (
        amountToPaise(extraction.fields.amountClaimed) >
        amountToPaise(extraction.fields.estimatedCost)
      ) {
        issues.push("Amount claimed exceeds the estimated treatment cost.");
      }
    } catch {
      // Invalid amount syntax is reported above.
    }
  }
  if (
    extraction.fields.treatmentDate &&
    extraction.fields.validFrom &&
    extraction.fields.validUntil &&
    isCalendarDate(extraction.fields.treatmentDate) &&
    isCalendarDate(extraction.fields.validFrom) &&
    isCalendarDate(extraction.fields.validUntil) &&
    !(
      extraction.fields.treatmentDate >= extraction.fields.validFrom &&
      extraction.fields.treatmentDate <= extraction.fields.validUntil
    )
  ) {
    issues.push("Treatment date falls outside the extracted policy period.");
  }
  if (
    extraction.fields.currencyCode === "OTHER" &&
    amountFields.some((field) => extraction.fields[field] !== null)
  ) {
    issues.push("A non-INR amount requires manual conversion before review.");
  }

  compareText(
    "Patient name",
    extraction.fields.patientName,
    context.patientName,
    issues,
  );
  compareText(
    "Provider name",
    extraction.fields.providerName,
    context.providerName,
    issues,
  );
  compareText(
    "Policy number",
    extraction.fields.policyNumber,
    context.policyNumber,
    issues,
  );

  const compareDate = (
    label: string,
    actual: string | null,
    expected: string | undefined,
  ) => {
    if (actual && expected && actual !== expected) {
      issues.push(`${label} does not match the selected policy record.`);
    }
  };
  compareDate(
    "Policy start date",
    extraction.fields.validFrom,
    context.policyValidFrom,
  );
  compareDate(
    "Policy end date",
    extraction.fields.validUntil,
    context.policyValidUntil,
  );
  compareDate(
    "Treatment date",
    extraction.fields.treatmentDate,
    context.treatmentDate,
  );

  for (const [label, actual, expected] of [
    ["Estimated cost", extraction.fields.estimatedCost, context.estimatedCost],
    ["Claimed amount", extraction.fields.amountClaimed, context.amountClaimed],
  ] as const) {
    if (actual && expected) {
      try {
        if (amountToPaise(actual) !== amountToPaise(expected)) {
          issues.push(`${label} does not match the claim record.`);
        }
      } catch {
        // Invalid amount syntax is reported above.
      }
    }
  }

  return { missingFields, issues: Array.from(new Set(issues)) };
}

export function validatePolicyAnswerCitations(
  answer: InsurancePolicyAnswer,
  pageCount: number,
): readonly string[] {
  const issues: string[] = [];
  if (answer.citations.some(({ page }) => page > pageCount)) {
    issues.push(
      "A policy answer citation refers to a page outside the source.",
    );
  }
  if (answer.citations.length === 0 && answer.unknowns.length === 0) {
    issues.push("A policy answer must cite a source or state what is unknown.");
  }
  return issues;
}

export function validateInsuranceClaimSummary(
  fields: InsuranceExtractionFields,
  context: InsuranceClaimSummaryContext,
): readonly string[] {
  const issues: string[] = [];
  const required: ReadonlyArray<keyof InsuranceExtractionFields> = [
    "patientName",
    "providerName",
    "policyNumber",
    "validFrom",
    "validUntil",
    "treatmentDate",
    "treatmentDescription",
    "estimatedCost",
    "amountClaimed",
  ];
  for (const field of required) {
    if (!fields[field]) issues.push(`${field} is required before review.`);
  }
  for (const field of dateFields) {
    const value = fields[field];
    if (value && !isCalendarDate(value)) {
      issues.push(`${field} is not a valid YYYY-MM-DD date.`);
    }
  }
  if (
    fields.validFrom &&
    fields.validUntil &&
    isCalendarDate(fields.validFrom) &&
    isCalendarDate(fields.validUntil) &&
    fields.validFrom > fields.validUntil
  ) {
    issues.push("Policy start date is after its end date.");
  }
  if (
    fields.treatmentDate &&
    fields.validFrom &&
    fields.validUntil &&
    isCalendarDate(fields.treatmentDate) &&
    isCalendarDate(fields.validFrom) &&
    isCalendarDate(fields.validUntil) &&
    (fields.treatmentDate < fields.validFrom ||
      fields.treatmentDate > fields.validUntil)
  ) {
    issues.push("Treatment date falls outside the policy validity period.");
  }
  for (const field of amountFields) {
    const value = fields[field];
    if (value) {
      try {
        amountToPaise(value);
      } catch {
        issues.push(`${field} is not a valid INR amount.`);
      }
    }
  }
  if (fields.amountClaimed && fields.estimatedCost) {
    try {
      if (
        amountToPaise(fields.amountClaimed) >
        amountToPaise(fields.estimatedCost)
      ) {
        issues.push("Amount claimed exceeds the estimated treatment cost.");
      }
    } catch {
      // Invalid amount syntax is reported above.
    }
  }
  if (
    fields.coPaymentPercent &&
    (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(fields.coPaymentPercent) ||
      Number(fields.coPaymentPercent) > 100)
  ) {
    issues.push("Co-payment must be between 0 and 100 percent.");
  }
  if (fields.currencyCode !== "INR") {
    issues.push("Confirm and convert all amounts to INR before review.");
  }

  compareText("Patient name", fields.patientName, context.patientName, issues);
  compareText(
    "Provider name",
    fields.providerName,
    context.providerName,
    issues,
  );
  compareText(
    "Policy number",
    fields.policyNumber,
    context.policyNumber,
    issues,
  );
  for (const [label, actual, expected] of [
    ["Policy start date", fields.validFrom, context.policyValidFrom],
    ["Policy end date", fields.validUntil, context.policyValidUntil],
    ["Treatment date", fields.treatmentDate, context.treatmentDate],
  ] as const) {
    if (actual && actual !== expected) {
      issues.push(`${label} does not match the clinic record.`);
    }
  }
  for (const [label, actual, expected] of [
    ["Estimated cost", fields.estimatedCost, context.estimatedCost],
    ["Claimed amount", fields.amountClaimed, context.amountClaimed],
  ] as const) {
    if (actual) {
      try {
        if (amountToPaise(actual) !== amountToPaise(expected)) {
          issues.push(`${label} does not match the claim record.`);
        }
      } catch {
        // Invalid amount syntax is reported above.
      }
    }
  }
  return Array.from(new Set(issues));
}

export function validateInsuranceFile(
  bytes: Uint8Array,
  storagePath: string,
): Readonly<{
  contentType: "application/pdf" | "image/jpeg" | "image/png";
}> | null {
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) return null;

  const extension = storagePath.split(".").at(-1)?.toLowerCase();
  if (
    extension === "pdf" &&
    bytes.length >= 5 &&
    String.fromCharCode(...Array.from(bytes.subarray(0, 5))) === "%PDF-"
  ) {
    return { contentType: "application/pdf" };
  }
  if (
    extension === "jpg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg" };
  }
  if (
    extension === "png" &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png" };
  }
  return null;
}
