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
import { createTreatmentFinancialEntryRequestHash } from "@/features/treatments/lib/treatment-finance-idempotency";

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


test("financial idempotency hashes include payment references and audit reasons", () => {
  const base = treatmentFinancialEntrySchema.parse({
    entryType: "REFUND",
    amount: "25.00",
    notes: "Refund approved by clinic owner",
    reference: "UPI-REF-100",
    paidAt: "2026-11-14T10:00:00.000Z",
    requestKey,
  });
  const hash = (input: typeof base) =>
    createTreatmentFinancialEntryRequestHash(
      "patient-a",
      "plan-a",
      "owner-a",
      input,
    );

  assert.equal(hash(base), hash({ ...base }));
  assert.notEqual(hash(base), hash({ ...base, notes: "Different refund reason" }));
  assert.notEqual(hash(base), hash({ ...base, reference: "UPI-REF-101" }));
  assert.notEqual(hash(base), hash({ ...base, amount: "26.00" }));
});
