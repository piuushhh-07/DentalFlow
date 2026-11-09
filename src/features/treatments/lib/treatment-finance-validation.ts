import {
  FinancialEntryType,
  PaymentMethod,
  TreatmentCatalogStatus,
  TreatmentPlanStatus,
} from "@prisma/client";
import { z } from "zod";

const amountSchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Enter a valid amount with up to 2 decimals.",
  );

export const treatmentFinancialEntrySchema = z
  .object({
    entryType: z.nativeEnum(FinancialEntryType),
    amount: amountSchema,
    discountMode: z.enum(["FIXED", "PERCENT"]).optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    reference: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    paidAt: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
        "Choose a valid date.",
      )
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "Choose a valid date.",
      ),
    requestKey: z.string().uuid(),
  })
  .superRefine((input, context) => {
    if (
      input.entryType !== FinancialEntryType.PAYMENT &&
      !input.notes?.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "A reason is required for discounts and refunds.",
      });
    }
    if (
      input.entryType === FinancialEntryType.PAYMENT &&
      !input.paymentMethod
    ) {
      context.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Choose a payment method.",
      });
    }
    if (
      input.entryType === FinancialEntryType.DISCOUNT &&
      !input.discountMode
    ) {
      context.addIssue({
        code: "custom",
        path: ["discountMode"],
        message: "Choose a discount type.",
      });
    }
  });

export type TreatmentFinancialEntryInput = z.output<
  typeof treatmentFinancialEntrySchema
>;

export const financialEntryTypeLabels: Record<FinancialEntryType, string> = {
  PAYMENT: "Payment",
  DISCOUNT: "Discount",
  REFUND: "Refund",
};

export const treatmentCatalogueItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  defaultPrice: amountSchema.optional().or(z.literal("")),
});

export const treatmentCatalogueStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(TreatmentCatalogStatus),
});

export const treatmentPlanFinanceSchema = z.object({
  estimatedAmount: amountSchema.optional().or(z.literal("")),
  finalAmount: amountSchema.optional().or(z.literal("")),
  catalogItemId: z.string().uuid().optional().or(z.literal("")),
  status: z.nativeEnum(TreatmentPlanStatus),
});
