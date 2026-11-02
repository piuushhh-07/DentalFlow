import assert from "node:assert/strict";
import test from "node:test";
import { TreatmentEstimateStatus } from "@prisma/client";

import {
  calculateTreatmentEstimateTotals,
  canTransitionTreatmentEstimate,
  createTreatmentEstimateSchema,
} from "@/features/estimates/lib/estimate-validation";

const validInput = {
  estimateDate: "2026-11-02",
  validityDate: "2026-12-02",
  discountAmount: "500.00",
  taxRate: "18.00",
  lines: [
    {
      catalogueItemId: "",
      description: "Root canal treatment",
      quantity: "2",
      unitPrice: "1500.00",
    },
    {
      catalogueItemId: "",
      description: "Temporary restoration",
      quantity: "1",
      unitPrice: "500",
    },
  ],
};

test("estimate calculations apply discount before configured tax", () => {
  const totals = calculateTreatmentEstimateTotals(
    [
      { quantity: 2, unitPrice: "1500.00" },
      { quantity: 1, unitPrice: "500.00" },
    ],
    "500.00",
    "18.00",
  );
  assert.deepEqual(totals, {
    lineTotals: ["3000.00", "500.00"],
    subtotal: "3500.00",
    discountAmount: "500.00",
    taxRate: "18.00",
    taxAmount: "540.00",
    totalAmount: "3540.00",
  });
  assert.throws(
    () =>
      calculateTreatmentEstimateTotals(
        [{ quantity: 1, unitPrice: "100.00" }],
        "100.01",
        "0",
      ),
    /Discount cannot exceed/,
  );
});

test("estimate tax rounds half-up to paise without floating-point drift", () => {
  const totals = calculateTreatmentEstimateTotals(
    [{ quantity: 1, unitPrice: "0.10" }],
    "0",
    "5",
  );
  assert.equal(totals.taxAmount, "0.01");
  assert.equal(totals.totalAmount, "0.11");
});

test("estimate validation rejects invalid quantities, amounts, dates and tax", () => {
  for (const quantity of ["0", "-1", "1.5", "10001"]) {
    assert.equal(
      createTreatmentEstimateSchema.safeParse({
        ...validInput,
        lines: [{ ...validInput.lines[0], quantity }],
      }).success,
      false,
      `quantity ${quantity} should be rejected`,
    );
  }
  for (const unitPrice of ["-1", "10.999", "12345678901"]) {
    assert.equal(
      createTreatmentEstimateSchema.safeParse({
        ...validInput,
        lines: [{ ...validInput.lines[0], unitPrice }],
      }).success,
      false,
      `unit price ${unitPrice} should be rejected`,
    );
  }
  assert.equal(
    createTreatmentEstimateSchema.safeParse({
      ...validInput,
      taxRate: "100.01",
    }).success,
    false,
  );
  assert.equal(
    createTreatmentEstimateSchema.safeParse({
      ...validInput,
      validityDate: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    createTreatmentEstimateSchema.safeParse({
      ...validInput,
      discountAmount: "3500.01",
    }).success,
    false,
  );
});

test("valid estimate inputs allow multiple priced catalogue or custom procedures", () => {
  const result = createTreatmentEstimateSchema.safeParse(validInput);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.lines.length, 2);
});

test("estimate status transitions prevent stale acceptance and preserve finality", () => {
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.DRAFT,
      TreatmentEstimateStatus.SENT,
      "2026-12-02",
      "2026-11-02",
    ),
    true,
  );
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.DRAFT,
      TreatmentEstimateStatus.ACCEPTED,
      "2026-12-02",
      "2026-11-02",
    ),
    false,
  );
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.SENT,
      TreatmentEstimateStatus.ACCEPTED,
      "2026-11-01",
      "2026-11-02",
    ),
    false,
  );
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.SENT,
      TreatmentEstimateStatus.EXPIRED,
      "2026-11-01",
      "2026-11-02",
    ),
    true,
  );
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.ACCEPTED,
      TreatmentEstimateStatus.CONVERTED,
      "2026-12-02",
      "2026-11-02",
    ),
    true,
  );
  assert.equal(
    canTransitionTreatmentEstimate(
      TreatmentEstimateStatus.CONVERTED,
      TreatmentEstimateStatus.ACCEPTED,
      "2026-12-02",
      "2026-11-02",
    ),
    false,
  );
});

test("estimate revisions require a reason and valid original identifier", () => {
  assert.equal(
    createTreatmentEstimateSchema.safeParse({
      ...validInput,
      revisionOfEstimateId: "4c679927-7a8a-4812-b6a6-9089084c9474",
    }).success,
    false,
  );
  assert.equal(
    createTreatmentEstimateSchema.safeParse({
      ...validInput,
      revisionOfEstimateId: "4c679927-7a8a-4812-b6a6-9089084c9474",
      revisionReason: "Updated procedure cost",
    }).success,
    true,
  );
});
