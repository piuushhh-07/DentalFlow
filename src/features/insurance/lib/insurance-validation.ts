import { z } from "zod";

export const insuranceProviderKinds = ["INSURER", "TPA", "BOTH"] as const;
export const insuranceClaimTypes = ["CASHLESS", "REIMBURSEMENT"] as const;
export const insuranceClaimStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_DOCUMENTS",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "PAID",
  "CLOSED",
] as const;
export const insurancePreAuthorizationStatuses = [
  "DRAFT",
  "SUBMITTED",
  "NEEDS_DOCUMENTS",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export const insuranceDocumentTypes = [
  "POLICY_COPY",
  "TREATMENT_ESTIMATE",
  "TREATMENT_PLAN",
  "CLAIM_FORM",
  "INVOICE",
  "PRESCRIPTION",
  "DIAGNOSTIC_REPORT",
  "DISCHARGE_SUMMARY",
  "OTHER",
] as const;
export const insuranceDocumentStatuses = [
  "REQUIRED",
  "RECEIVED",
  "VERIFIED",
  "REJECTED",
] as const;
export const insurancePaymentKinds = [
  "PATIENT_PAYMENT",
  "INSURER_PAYMENT",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const currencyAmountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export const currencyAmountSchema = z
  .string()
  .trim()
  .regex(
    currencyAmountPattern,
    "Enter an amount in INR with up to two decimal places.",
  )
  .refine(
    (value) =>
      !currencyAmountPattern.test(value) ||
      amountToPaise(value) <= BigInt("999999999999"),
    {
      message: "The amount is too large.",
    },
  );

export const positiveCurrencyAmountSchema = currencyAmountSchema.refine(
  (value) =>
    !currencyAmountPattern.test(value) || amountToPaise(value) > BigInt(0),
  { message: "Amount must be greater than zero." },
);

export const optionalCurrencyAmountSchema = z
  .union([currencyAmountSchema, z.literal("")])
  .transform((value) => (value ? normalizeCurrencyAmount(value) : null));

export const providerInputSchema = z.object({
  name: z.string().trim().min(2).max(180),
  kind: z.enum(insuranceProviderKinds),
  phoneNumber: optionalText(20),
  email: z
    .union([z.string().trim().email().max(254), z.literal("")])
    .transform((value) => value || null),
  website: z
    .union([z.string().trim().url().max(400), z.literal("")])
    .transform((value) => value || null),
  claimInstructions: optionalText(5000),
  notes: optionalText(5000),
});

export const policyInputSchema = z
  .object({
    patientId: z.string().uuid(),
    providerId: z.string().uuid(),
    policyNumber: z.string().trim().min(1).max(120),
    memberReference: optionalText(120),
    validFrom: z.string().date(),
    validUntil: z.string().date(),
    coverageLimit: optionalCurrencyAmountSchema,
    deductible: optionalCurrencyAmountSchema,
    coPaymentPercent: z
      .union([
        z
          .string()
          .trim()
          .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/),
        z.literal(""),
      ])
      .transform((value) => (value ? normalizeCurrencyAmount(value) : null)),
    exclusions: optionalText(10000),
    coverageNotes: optionalText(5000),
  })
  .refine((value) => value.validFrom <= value.validUntil, {
    path: ["validUntil"],
    message: "Policy end date must be on or after its start date.",
  })
  .refine(
    (value) =>
      value.coPaymentPercent === null ||
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value.coPaymentPercent) ||
      amountToPaise(value.coPaymentPercent) <= BigInt(10_000),
    {
      path: ["coPaymentPercent"],
      message: "Co-payment must be between 0 and 100 percent.",
    },
  );

export const claimInputSchema = z.object({
  patientId: z.string().uuid(),
  policyId: z.string().uuid(),
  treatmentPlanId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  preAuthorizationId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  type: z.enum(insuranceClaimTypes),
  treatmentDetails: z.string().trim().min(2).max(2000),
  treatmentDate: z.string().date(),
  estimatedCost: positiveCurrencyAmountSchema,
  amountClaimed: positiveCurrencyAmountSchema,
  claimReference: optionalText(120),
  notes: optionalText(10000),
});

export const preAuthorizationInputSchema = z.object({
  patientId: z.string().uuid(),
  policyId: z.string().uuid(),
  treatmentPlanId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  proposedTreatment: z.string().trim().min(2).max(2000),
  estimatedCost: positiveCurrencyAmountSchema,
  requestReference: optionalText(120),
});

export const decisionInputSchema = z.object({
  status: z.enum([
    "SUBMITTED",
    "NEEDS_DOCUMENTS",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]),
  approvedAmount: optionalCurrencyAmountSchema,
  conditions: optionalText(5000),
  rejectionReason: optionalText(5000),
  expiresAt: z
    .union([z.string().date(), z.literal("")])
    .transform((value) => value || null),
});

export const claimStatusInputSchema = z.object({
  status: z.enum(insuranceClaimStatuses),
  approvedAmount: optionalCurrencyAmountSchema,
  rejectionReason: optionalText(5000),
});

export const paymentInputSchema = z.object({
  kind: z.enum(insurancePaymentKinds),
  amount: positiveCurrencyAmountSchema,
  paidAt: z.string().datetime({ offset: true }),
  reference: optionalText(120),
  notes: optionalText(2000),
});

export const documentInputSchema = z.object({
  type: z.enum(insuranceDocumentTypes),
  name: z.string().trim().min(2).max(160),
});

export const documentStatusInputSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: optionalText(2000),
});

export const claimSearchSchema = z
  .object({
    query: z.string().trim().max(100).default(""),
    patientId: z.string().uuid().optional(),
    type: z
      .union([z.enum(insuranceClaimTypes), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    status: z
      .union([z.enum(insuranceClaimStatuses), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    from: z.union([z.string().date(), z.literal("")]).optional(),
    to: z.union([z.string().date(), z.literal("")]).optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after the start date.",
  });

export function normalizeCurrencyAmount(value: string): string {
  const paise = amountToPaise(value);
  const hundred = BigInt(100);
  return `${paise / hundred}.${String(paise % hundred).padStart(2, "0")}`;
}

export function amountToPaise(value: string): bigint {
  const [rupees, decimal = ""] = value.split(".");
  return BigInt(rupees) * BigInt(100) + BigInt(decimal.padEnd(2, "0") || "0");
}

export function formatPaise(paise: bigint): string {
  const negative = paise < BigInt(0);
  const absolute = negative ? -paise : paise;
  const hundred = BigInt(100);
  return `${negative ? "-" : ""}${absolute / hundred}.${String(absolute % hundred).padStart(2, "0")}`;
}

export function calculateOutstandingPaise(
  approvedAmount: string | null,
  insurerPayments: readonly string[],
): bigint {
  if (!approvedAmount) return BigInt(0);
  const paid = insurerPayments.reduce(
    (total, amount) => total + amountToPaise(amount),
    BigInt(0),
  );
  const outstanding = amountToPaise(approvedAmount) - paid;
  return outstanding > BigInt(0) ? outstanding : BigInt(0);
}

const claimTransitions: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["SUBMITTED", "CLOSED"],
  SUBMITTED: [
    "UNDER_REVIEW",
    "NEEDS_DOCUMENTS",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CLOSED",
  ],
  UNDER_REVIEW: [
    "NEEDS_DOCUMENTS",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CLOSED",
  ],
  NEEDS_DOCUMENTS: [
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "PARTIALLY_APPROVED",
    "REJECTED",
    "CLOSED",
  ],
  APPROVED: ["PAID", "CLOSED"],
  PARTIALLY_APPROVED: ["PAID", "CLOSED"],
  REJECTED: ["SUBMITTED", "CLOSED"],
  PAID: ["CLOSED"],
  CLOSED: [],
};

export function getAvailableClaimTransitions(
  status: string,
): readonly string[] {
  return claimTransitions[status] ?? [];
}

export type ClaimTransitionContext = Readonly<{
  claimType: (typeof insuranceClaimTypes)[number];
  amountClaimed: string;
  amountApproved: string | null;
  insurerPaid: string;
  patientPaid: string;
  hasRequiredDocuments: boolean;
}>;

export function validateClaimTransition(
  current: string,
  next: string,
  context: ClaimTransitionContext,
  nextApprovedAmount: string | null = context.amountApproved,
  rejectionReason: string | null = null,
): string | null {
  if (!claimTransitions[current]?.includes(next)) {
    return "That claim status change is not allowed.";
  }
  if (next === "SUBMITTED") {
    if (!context.hasRequiredDocuments) {
      return "Add or resolve all required documents before submission.";
    }
    if (
      context.claimType === "REIMBURSEMENT" &&
      amountToPaise(context.patientPaid) < amountToPaise(context.amountClaimed)
    ) {
      return "Record patient payment of the claimed amount before submitting a reimbursement.";
    }
  }
  if (next === "APPROVED" || next === "PARTIALLY_APPROVED") {
    if (!nextApprovedAmount) return "Record the insurer-approved amount.";
    const approved = amountToPaise(nextApprovedAmount);
    const claimed = amountToPaise(context.amountClaimed);
    if (approved <= BigInt(0) || approved > claimed) {
      return "Approved amount must be positive and no greater than the claim amount.";
    }
    if (next === "APPROVED" && approved !== claimed) {
      return "Use partially approved when the approved amount is below the claim amount.";
    }
    if (next === "PARTIALLY_APPROVED" && approved >= claimed) {
      return "A partial approval must be below the claim amount.";
    }
  }
  if (next === "REJECTED" && !rejectionReason?.trim()) {
    return "A rejection reason is required.";
  }
  if (next === "PAID") {
    if (!context.amountApproved) {
      return "A claim cannot be marked paid before approval.";
    }
    if (
      amountToPaise(context.insurerPaid) < amountToPaise(context.amountApproved)
    ) {
      return "Record insurer payments for the full approved amount before marking the claim paid.";
    }
  }
  return null;
}

const preAuthorizationTransitions: Readonly<Record<string, readonly string[]>> =
  {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: [
      "NEEDS_DOCUMENTS",
      "APPROVED",
      "PARTIALLY_APPROVED",
      "REJECTED",
      "CANCELLED",
    ],
    NEEDS_DOCUMENTS: [
      "SUBMITTED",
      "APPROVED",
      "PARTIALLY_APPROVED",
      "REJECTED",
      "CANCELLED",
    ],
    APPROVED: ["EXPIRED", "CANCELLED"],
    PARTIALLY_APPROVED: ["EXPIRED", "CANCELLED"],
    REJECTED: ["SUBMITTED", "CANCELLED"],
    EXPIRED: ["CANCELLED"],
    CANCELLED: [],
  };

export function getAvailablePreAuthorizationTransitions(
  status: string,
): readonly string[] {
  return preAuthorizationTransitions[status] ?? [];
}

export function validatePreAuthorizationTransition(
  current: string,
  next: string,
  estimate: string,
  approvedAmount: string | null,
  rejectionReason: string | null = null,
): string | null {
  if (!preAuthorizationTransitions[current]?.includes(next)) {
    return "That pre-authorization status change is not allowed.";
  }
  if (next === "APPROVED" || next === "PARTIALLY_APPROVED") {
    if (!approvedAmount) return "Record the insurer-approved amount.";
    const amount = amountToPaise(approvedAmount);
    const estimated = amountToPaise(estimate);
    if (amount <= BigInt(0) || amount > estimated) {
      return "Approved amount must be positive and no greater than the estimate.";
    }
    if (next === "APPROVED" && amount !== estimated) {
      return "Use partially approved when the amount is below the estimate.";
    }
    if (next === "PARTIALLY_APPROVED" && amount >= estimated) {
      return "A partial approval must be below the estimate.";
    }
  }
  if (next === "REJECTED" && !rejectionReason?.trim()) {
    return "A rejection reason is required.";
  }
  return null;
}

export function isPolicyUsableOn(
  validFrom: string,
  validUntil: string,
  date: string,
): boolean {
  return validFrom <= date && validUntil >= date;
}

export function maskPolicyIdentifier(value: string): string {
  const visibleCharacters = Math.min(4, value.length);
  return `${"•".repeat(Math.max(value.length - visibleCharacters, 4))}${value.slice(-visibleCharacters)}`;
}

export function getMissingDocumentCount(
  documents: readonly Readonly<{ status: string }>[],
): number {
  return documents.filter(
    ({ status }) => status === "REQUIRED" || status === "REJECTED",
  ).length;
}
