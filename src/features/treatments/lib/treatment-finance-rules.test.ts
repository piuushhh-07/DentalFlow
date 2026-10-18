import assert from "node:assert/strict";
import test from "node:test";
import { FinancialEntryType, Prisma } from "@prisma/client";

import {
  assertTreatmentDiscountWithinCost,
  assertTreatmentRefundWithinPayments,
  calculateTreatmentEntryAmount,
  calculateTreatmentLedgerBalance,
} from "@/features/treatments/lib/treatment-finance-rules";
import { treatmentFinancialEntrySchema } from "@/features/treatments/lib/treatment-finance-validation";

const zero = new Prisma.Decimal(0);
const requestKey = "a7627c15-9507-4887-bcf0-5d8b88b07dd8";

test("treatment finance validation requires reasons and valid precision", () => {
  const missingReason = treatmentFinancialEntrySchema.safeParse({
    entryType: "REFUND",
    amount: "10.00",
    paidAt: "2026-10-18",
    requestKey,
  });
  assert.equal(missingReason.success, false);

  const excessivePrecision = treatmentFinancialEntrySchema.safeParse({
    entryType: "PAYMENT",
    amount: "10.001",
    paymentMethod: "UPI",
    paidAt: "2026-10-18",
    requestKey,
  });
  assert.equal(excessivePrecision.success, false);

  const validPayment = treatmentFinancialEntrySchema.safeParse({
    entryType: "PAYMENT",
    amount: "1250.50",
    paymentMethod: "UPI",
    paidAt: "2026-10-18",
    requestKey,
  });
  assert.equal(validPayment.success, true);
});

test("percentage discounts use decimal precision and cap the remaining amount", () => {
  const discount = calculateTreatmentEntryAmount({
    entryType: FinancialEntryType.DISCOUNT,
    submittedAmount: new Prisma.Decimal("12.5"),
    discountMode: "PERCENT",
    finalAmount: new Prisma.Decimal("1000.00"),
    priorDiscounts: new Prisma.Decimal("100.00"),
  });
  assert.equal(discount.toFixed(2), "112.50");
  assert.throws(
    () =>
      calculateTreatmentEntryAmount({
        entryType: FinancialEntryType.DISCOUNT,
        submittedAmount: new Prisma.Decimal("101"),
        discountMode: "PERCENT",
        finalAmount: new Prisma.Decimal("1000"),
        priorDiscounts: zero,
      }),
    /cannot exceed 100%/,
  );
  assert.throws(
    () =>
      assertTreatmentDiscountWithinCost(
        new Prisma.Decimal("900.01"),
        new Prisma.Decimal("1000"),
        new Prisma.Decimal("100"),
      ),
    /cannot exceed the remaining treatment cost/,
  );
});

test("refunds cannot exceed net received payments and ledger handles credits", () => {
  assert.throws(
    () =>
      assertTreatmentRefundWithinPayments(
        new Prisma.Decimal("40"),
        new Prisma.Decimal("100"),
        new Prisma.Decimal("70"),
      ),
    /cannot exceed the payments received/,
  );
  assert.equal(
    calculateTreatmentLedgerBalance(new Prisma.Decimal("1000"), {
      payments: new Prisma.Decimal("1200"),
      refunds: zero,
      discounts: new Prisma.Decimal("50"),
    }).toFixed(2),
    "-250.00",
  );
});
