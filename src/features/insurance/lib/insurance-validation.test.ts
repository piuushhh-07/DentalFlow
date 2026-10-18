import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amountToPaise,
  calculateOutstandingPaise,
  getMissingDocumentCount,
  isPolicyUsableOn,
  maskPolicyIdentifier,
  normalizeCurrencyAmount,
  positiveCurrencyAmountSchema,
  decisionInputSchema,
  claimSearchSchema,
  getAvailableClaimTransitions,
  getAvailablePreAuthorizationTransitions,
  paymentInputSchema,
  validateClaimTransition,
  validatePreAuthorizationTransition,
} from "@/features/insurance/lib/insurance-validation";
import {
  authorizeClinicMembership,
  ClinicAccessDeniedError,
} from "@/features/auth/lib/authorization";
import { ClinicRole } from "@prisma/client";

const clinicId = "20000000-0000-4000-8000-000000000001";
const otherClinicId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";

const baseContext = {
  claimType: "CASHLESS" as const,
  amountClaimed: "1000.00",
  amountApproved: null,
  insurerPaid: "0.00",
  patientPaid: "0.00",
  hasRequiredDocuments: true,
};

describe("insurance validation", () => {
  it("normalizes rupee input to paise-safe decimal strings", () => {
    assert.equal(normalizeCurrencyAmount("125.5"), "125.50");
    assert.equal(amountToPaise("0.09"), BigInt(9));
    assert.equal(normalizeCurrencyAmount("100000.01"), "100000.01");
    assert.equal(
      positiveCurrencyAmountSchema.safeParse("not-money").success,
      false,
    );
  });

  it("rejects zero-valued claims and accepts clinic-local payment timestamps", () => {
    assert.equal(positiveCurrencyAmountSchema.safeParse("0").success, false);
    assert.equal(positiveCurrencyAmountSchema.safeParse("0.01").success, true);
    assert.equal(
      paymentInputSchema.safeParse({
        kind: "PATIENT_PAYMENT",
        amount: "100.00",
        paidAt: "2026-10-16T14:30:00+05:30",
        reference: "",
        notes: "",
      }).success,
      true,
    );
    assert.equal(
      decisionInputSchema.safeParse({
        status: "SUBMITTED",
        approvedAmount: "",
        conditions: "",
        expiresAt: "",
        rejectionReason: "",
      }).success,
      true,
    );
    assert.deepEqual(getAvailableClaimTransitions("DRAFT"), [
      "SUBMITTED",
      "CLOSED",
    ]);
    assert.deepEqual(getAvailablePreAuthorizationTransitions("DRAFT"), [
      "SUBMITTED",
      "CANCELLED",
    ]);
    assert.equal(
      claimSearchSchema.safeParse({
        patientId: "20000000-0000-4000-8000-000000000001",
      }).success,
      true,
    );
  });

  it("calculates remaining insurer amount without floating point errors", () => {
    assert.equal(
      calculateOutstandingPaise("100.00", ["35.10", "24.90"]),
      BigInt(4000),
    );
    assert.equal(calculateOutstandingPaise("10.00", ["12.00"]), BigInt(0));
    assert.equal(calculateOutstandingPaise(null, ["1.00"]), BigInt(0));
  });

  it("blocks an approval decision that would imply unapproved coverage", () => {
    assert.match(
      validateClaimTransition("SUBMITTED", "APPROVED", baseContext, "900.00") ??
        "",
      /partially approved/i,
    );
    assert.equal(
      validateClaimTransition(
        "SUBMITTED",
        "PARTIALLY_APPROVED",
        baseContext,
        "900.00",
      ),
      null,
    );
  });

  it("rejects invalid transitions, missing docs and incomplete reimbursement payment", () => {
    assert.ok(validateClaimTransition("PAID", "SUBMITTED", baseContext));
    assert.ok(
      validateClaimTransition("DRAFT", "SUBMITTED", {
        ...baseContext,
        hasRequiredDocuments: false,
      }),
    );
    assert.ok(
      validateClaimTransition("DRAFT", "SUBMITTED", {
        ...baseContext,
        claimType: "REIMBURSEMENT",
        patientPaid: "999.99",
      }),
    );
  });

  it("requires payment and a reason before marking claims paid or rejected", () => {
    assert.ok(
      validateClaimTransition("APPROVED", "PAID", {
        ...baseContext,
        amountApproved: "1000.00",
        insurerPaid: "999.99",
      }),
    );
    assert.ok(validateClaimTransition("SUBMITTED", "REJECTED", baseContext));
    assert.equal(
      validateClaimTransition(
        "SUBMITTED",
        "REJECTED",
        baseContext,
        null,
        "Not covered",
      ),
      null,
    );
  });

  it("handles missing and expired policy validity conservatively", () => {
    assert.equal(
      isPolicyUsableOn("2026-01-01", "2026-12-31", "2026-06-15"),
      true,
    );
    assert.equal(
      isPolicyUsableOn("2026-01-01", "2026-05-31", "2026-06-15"),
      false,
    );
  });

  it("never treats a pre-authorization estimate as an approval", () => {
    assert.ok(
      validatePreAuthorizationTransition(
        "SUBMITTED",
        "APPROVED",
        "1000.00",
        null,
      ),
    );
    assert.match(
      validatePreAuthorizationTransition(
        "SUBMITTED",
        "APPROVED",
        "1000.00",
        "500.00",
      ) ?? "",
      /partially approved/i,
    );
    assert.equal(
      validatePreAuthorizationTransition(
        "SUBMITTED",
        "PARTIALLY_APPROVED",
        "1000.00",
        "500.00",
      ),
      null,
    );
  });

  it("masks policy identifiers in summaries", () => {
    assert.equal(maskPolicyIdentifier("POLICY123456"), "••••••••3456");
  });

  it("counts required and rejected documents as missing", () => {
    assert.equal(
      getMissingDocumentCount([
        { status: "REQUIRED" },
        { status: "REJECTED" },
        { status: "RECEIVED" },
        { status: "VERIFIED" },
      ]),
      2,
    );
  });

  it("denies unauthenticated and cross-clinic access using the shared auth guard", () => {
    assert.throws(
      () => authorizeClinicMembership(userId, clinicId, null),
      ClinicAccessDeniedError,
    );
    assert.throws(
      () =>
        authorizeClinicMembership(userId, clinicId, {
          userId,
          clinicId: otherClinicId,
          role: ClinicRole.STAFF,
        }),
      ClinicAccessDeniedError,
    );
  });
});
