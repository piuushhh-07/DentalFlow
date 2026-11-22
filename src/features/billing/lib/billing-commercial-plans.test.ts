import assert from "node:assert/strict";
import test from "node:test";

import { billingEntitlementsSchema } from "@/features/billing/lib/billing-validation";
import { DENTALFLOW_COMMERCIAL_PLANS } from "@/features/billing/lib/billing-commercial-plans";

test("defines all six monthly and annual commercial plan versions", () => {
  assert.equal(DENTALFLOW_COMMERCIAL_PLANS.length, 6);
  assert.deepEqual(
    DENTALFLOW_COMMERCIAL_PLANS.map((plan) => plan.code),
    [
      "STARTER_MONTHLY",
      "STARTER_ANNUAL",
      "PROFESSIONAL_MONTHLY",
      "PROFESSIONAL_ANNUAL",
      "CLINIC_PLUS_MONTHLY",
      "CLINIC_PLUS_ANNUAL",
    ],
  );
});

test("uses the approved INR prices and annual discounts", () => {
  assert.deepEqual(
    DENTALFLOW_COMMERCIAL_PLANS.map((plan) => plan.amountMinor),
    [49900, 499900, 99900, 999900, 149900, 1499900],
  );
  assert.ok(DENTALFLOW_COMMERCIAL_PLANS.every((plan) => plan.intervalCount === 1));
});

test("enforces the Starter, Professional, and Clinic Plus team and patient limits", () => {
  const monthly = DENTALFLOW_COMMERCIAL_PLANS.filter((plan) => plan.interval === "MONTH");
  const [starter, professional, clinicPlus] = monthly;

  assert.deepEqual(
    [starter.entitlements.maxDentists, starter.entitlements.maxStaff, starter.entitlements.maxPatients],
    [1, 2, 300],
  );
  assert.deepEqual(
    [professional.entitlements.maxDentists, professional.entitlements.maxStaff, professional.entitlements.maxPatients],
    [3, 5, 1500],
  );
  assert.deepEqual(
    [clinicPlus.entitlements.maxDentists, clinicPlus.entitlements.maxStaff, clinicPlus.entitlements.maxPatients],
    [10, 15, 5000],
  );
});

test("keeps multi-branch entitlements disabled until that product capability is sold", () => {
  for (const plan of DENTALFLOW_COMMERCIAL_PLANS) {
    const parsed = billingEntitlementsSchema.parse(plan.entitlements);
    assert.equal(parsed.maxBranches, 1);
    assert.equal(parsed.features.multiBranchManagement, false);
    assert.equal(parsed.features.consolidatedFinance, false);
    assert.equal(parsed.features.interBranchTransfers, false);
  }
});
