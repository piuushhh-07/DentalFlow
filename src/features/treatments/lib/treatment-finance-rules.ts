import { FinancialEntryType, Prisma } from "@prisma/client";

export type TreatmentLedgerTotals = Readonly<{
  payments: Prisma.Decimal;
  refunds: Prisma.Decimal;
  discounts: Prisma.Decimal;
}>;

export function calculateTreatmentLedgerBalance(
  finalAmount: Prisma.Decimal,
  totals: TreatmentLedgerTotals,
) {
  return finalAmount
    .minus(totals.discounts)
    .minus(totals.payments)
    .plus(totals.refunds);
}

export function calculateTreatmentEntryAmount({
  entryType,
  submittedAmount,
  discountMode,
  finalAmount,
  priorDiscounts,
}: {
  entryType: FinancialEntryType;
  submittedAmount: Prisma.Decimal;
  discountMode?: "FIXED" | "PERCENT";
  finalAmount: Prisma.Decimal;
  priorDiscounts: Prisma.Decimal;
}) {
  if (entryType !== FinancialEntryType.DISCOUNT || discountMode !== "PERCENT") {
    return submittedAmount;
  }
  if (submittedAmount.greaterThan(100)) {
    throw new Error("Percentage discounts cannot exceed 100%.");
  }
  return finalAmount
    .minus(priorDiscounts)
    .times(submittedAmount)
    .dividedBy(100)
    .toDecimalPlaces(2);
}

export function assertTreatmentRefundWithinPayments(
  refund: Prisma.Decimal,
  payments: Prisma.Decimal,
  priorRefunds: Prisma.Decimal,
) {
  if (refund.greaterThan(payments.minus(priorRefunds))) {
    throw new Error(
      "Refund cannot exceed the payments received and not yet refunded.",
    );
  }
}

export function assertTreatmentDiscountWithinCost(
  discount: Prisma.Decimal,
  finalAmount: Prisma.Decimal,
  priorDiscounts: Prisma.Decimal,
) {
  if (discount.greaterThan(finalAmount.minus(priorDiscounts))) {
    throw new Error("The discount cannot exceed the remaining treatment cost.");
  }
}
