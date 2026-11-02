import { TreatmentEstimateStatus } from "@prisma/client";
import { z } from "zod";

import { calculateTreatmentEstimateTotals } from "@/features/estimates/lib/estimate-calculations";

export { calculateTreatmentEstimateTotals } from "@/features/estimates/lib/estimate-calculations";

const uuid = z.string().uuid();
const money = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 2 decimals.");

function isCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine(isCalendarDate, "Choose a valid date.");

export const estimateLineSchema = z.object({
  catalogueItemId: z.union([uuid, z.literal("")]).optional(),
  description: z.string().trim().min(2).max(300),
  quantity: z.coerce.number().int().min(1).max(10000),
  unitPrice: money,
});

export const createTreatmentEstimateSchema = z
  .object({
    revisionOfEstimateId: z.union([uuid, z.literal("")]).optional(),
    revisionReason: z.string().trim().max(1000).optional().or(z.literal("")),
    estimateDate: calendarDate,
    validityDate: calendarDate,
    discountAmount: money,
    taxRate: z
      .string()
      .trim()
      .regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Enter a tax rate from 0 to 100."),
    dentistRegistrationNumber: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(4000).optional().or(z.literal("")),
    terms: z.string().trim().max(4000).optional().or(z.literal("")),
    lines: z.array(estimateLineSchema).min(1).max(50),
  })
  .superRefine((input, context) => {
    if (input.validityDate < input.estimateDate) {
      context.addIssue({
        code: "custom",
        path: ["validityDate"],
        message: "Validity must be on or after the estimate date.",
      });
    }
    if (input.revisionOfEstimateId && !input.revisionReason?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["revisionReason"],
        message: "Explain why this estimate is being revised.",
      });
    }
    if (!input.revisionOfEstimateId && input.revisionReason?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["revisionOfEstimateId"],
        message: "A revision reason requires an estimate to revise.",
      });
    }
    if (Number(input.taxRate) > 100) {
      context.addIssue({
        code: "custom",
        path: ["taxRate"],
        message: "Tax rate cannot exceed 100%.",
      });
    }
    try {
      calculateTreatmentEstimateTotals(
        input.lines,
        input.discountAmount,
        input.taxRate,
      );
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message:
          error instanceof Error
            ? error.message
            : "Estimate amounts are outside the supported range.",
      });
    }
  });

export const estimateStatusTransitionSchema = z.object({
  estimateId: uuid,
  status: z.nativeEnum(TreatmentEstimateStatus),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CreateTreatmentEstimateInput = z.output<
  typeof createTreatmentEstimateSchema
>;
export type TreatmentEstimateLineInput = z.output<typeof estimateLineSchema>;

export function canTransitionTreatmentEstimate(
  current: TreatmentEstimateStatus,
  next: TreatmentEstimateStatus,
  validityDate: string,
  today: string,
) {
  if (current === TreatmentEstimateStatus.DRAFT) {
    return next === TreatmentEstimateStatus.SENT;
  }
  if (current !== TreatmentEstimateStatus.SENT) {
    return (
      current === TreatmentEstimateStatus.ACCEPTED &&
      next === TreatmentEstimateStatus.CONVERTED
    );
  }
  if (next === TreatmentEstimateStatus.EXPIRED) {
    return validityDate < today;
  }
  if (validityDate < today) return false;
  return (
    next === TreatmentEstimateStatus.ACCEPTED ||
    next === TreatmentEstimateStatus.REJECTED
  );
}
