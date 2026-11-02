import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  BillingSubscriptionStatus,
  BillingWebhookStatus,
  ClinicRole,
} from "@prisma/client";

import {
  authorizeClinicMembership,
  authorizeClinicRole,
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import {
  billingEntitlementsSchema,
  canApplyRazorpayEvent,
  canUsePaidEntitlements,
  isWebhookClaimAvailable,
  nextBillingSubscriptionState,
} from "@/features/billing/lib/billing-validation";
import {
  isRazorpayCheckoutUrl,
  verifyRazorpayWebhookSignature,
} from "@/features/billing/lib/razorpay-signature";

const baseTime = new Date("2026-10-24T12:00:00.000Z");

function snapshot(
  overrides: Partial<{
    status: BillingSubscriptionStatus;
    lastProviderEventCreatedAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    graceUntil: Date | null;
    cancelAtPeriodEnd: boolean;
  }> = {},
) {
  return {
    status: BillingSubscriptionStatus.CHECKOUT_PENDING,
    lastProviderEventCreatedAt: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    graceUntil: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

test("verifies Razorpay HMAC-SHA256 against the exact raw request body", () => {
  const secret = "synthetic-webhook-secret";
  const body = '{"event":"subscription.activated","created_at":1}';
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(body, signature, secret), true);
  assert.equal(
    verifyRazorpayWebhookSignature(`${body} `, signature, secret),
    false,
  );
  assert.equal(
    verifyRazorpayWebhookSignature(body, "not-a-signature", secret),
    false,
  );
});

test("accepts only HTTPS Razorpay-hosted checkout links", () => {
  assert.equal(isRazorpayCheckoutUrl("https://rzp.io/i/test-checkout"), true);
  assert.equal(isRazorpayCheckoutUrl("http://rzp.io/i/test-checkout"), false);
  assert.equal(isRazorpayCheckoutUrl("https://example.com/checkout"), false);
});

test("rejects duplicate processed webhook claims and reclaims stale failures", () => {
  assert.equal(
    isWebhookClaimAvailable(
      BillingWebhookStatus.PROCESSED,
      baseTime,
      baseTime,
      60_000,
    ),
    false,
  );
  assert.equal(
    isWebhookClaimAvailable(
      BillingWebhookStatus.PROCESSING,
      baseTime,
      new Date(baseTime.getTime() + 59_999),
      60_000,
    ),
    false,
  );
  assert.equal(
    isWebhookClaimAvailable(
      BillingWebhookStatus.PROCESSING,
      baseTime,
      new Date(baseTime.getTime() + 60_000),
      60_000,
    ),
    true,
  );
  assert.equal(
    isWebhookClaimAvailable(
      BillingWebhookStatus.FAILED,
      null,
      baseTime,
      60_000,
    ),
    true,
  );
});

test("ignores out-of-order subscription notifications without regressing status", () => {
  const lastEvent = new Date(baseTime.getTime() + 20_000);
  const current = snapshot({
    status: BillingSubscriptionStatus.CANCELLED,
    lastProviderEventCreatedAt: lastEvent,
  });
  const next = nextBillingSubscriptionState(
    current,
    {
      eventType: "subscription.activated",
      eventCreatedAt: new Date(baseTime.getTime() + 10_000),
      providerStatus: "active",
    },
    7,
  );

  assert.deepEqual(next, current);
  assert.equal(canApplyRazorpayEvent(lastEvent, baseTime), false);
  assert.equal(canApplyRazorpayEvent(lastEvent, lastEvent), false);
});

test("grants only the configured trial period and lets renewals restore access", () => {
  const trialEndsAt = new Date(baseTime.getTime() + 14 * 24 * 60 * 60 * 1000);
  const trialing = nextBillingSubscriptionState(
    snapshot({ trialEndsAt }),
    {
      eventType: "subscription.authenticated",
      eventCreatedAt: baseTime,
      providerStatus: "authenticated",
    },
    7,
  );
  assert.equal(trialing.status, BillingSubscriptionStatus.TRIALING);
  assert.equal(
    canUsePaidEntitlements({ ...trialing, currentPeriodEnd: null }, baseTime),
    true,
  );
  assert.equal(
    canUsePaidEntitlements(
      { ...trialing, currentPeriodEnd: null },
      trialEndsAt,
    ),
    false,
  );

  const active = nextBillingSubscriptionState(
    {
      ...trialing,
      status: BillingSubscriptionStatus.GRACE_PERIOD,
      graceUntil: new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      eventType: "subscription.charged",
      eventCreatedAt: new Date(baseTime.getTime() + 60_000),
      providerStatus: "active",
    },
    7,
  );
  assert.equal(active.status, BillingSubscriptionStatus.ACTIVE);
  assert.equal(active.graceUntil, null);
});

test("payment failures begin a fixed grace window that is not extended by retries", () => {
  const firstFailureAt = new Date(baseTime.getTime() + 10_000);
  const firstFailure = nextBillingSubscriptionState(
    snapshot(),
    {
      eventType: "subscription.pending",
      eventCreatedAt: firstFailureAt,
      providerStatus: "pending",
    },
    7,
  );
  assert.equal(firstFailure.status, BillingSubscriptionStatus.PAST_DUE);
  assert.equal(
    firstFailure.graceUntil?.getTime(),
    firstFailureAt.getTime() + 7 * 24 * 60 * 60 * 1000,
  );

  const retry = nextBillingSubscriptionState(
    firstFailure,
    {
      eventType: "subscription.halted",
      eventCreatedAt: new Date(firstFailureAt.getTime() + 24 * 60 * 60 * 1000),
      providerStatus: "halted",
    },
    7,
  );
  assert.equal(retry.status, BillingSubscriptionStatus.GRACE_PERIOD);
  assert.equal(retry.graceUntil, firstFailure.graceUntil);
  assert.equal(
    canUsePaidEntitlements(
      {
        status: retry.status,
        currentPeriodEnd: null,
        trialEndsAt: null,
        graceUntil: retry.graceUntil,
      },
      retry.graceUntil!,
    ),
    false,
  );
});

test("cancellation preserves scheduled-period access but ends access when final", () => {
  const periodEnd = new Date(baseTime.getTime() + 3 * 24 * 60 * 60 * 1000);
  const scheduled = snapshot({
    status: BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: true,
  });
  assert.equal(canUsePaidEntitlements(scheduled, baseTime), true);
  assert.equal(canUsePaidEntitlements(scheduled, periodEnd), false);

  const renewedButScheduled = nextBillingSubscriptionState(
    {
      ...scheduled,
      lastProviderEventCreatedAt: baseTime,
    },
    {
      eventType: "subscription.charged",
      eventCreatedAt: new Date(baseTime.getTime() + 1_000),
      providerStatus: "active",
    },
    7,
  );
  assert.equal(
    renewedButScheduled.status,
    BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
  );
  assert.equal(renewedButScheduled.cancelAtPeriodEnd, true);

  const cancelled = nextBillingSubscriptionState(
    renewedButScheduled,
    {
      eventType: "subscription.cancelled",
      eventCreatedAt: periodEnd,
      providerStatus: "cancelled",
    },
    7,
  );
  assert.equal(cancelled.status, BillingSubscriptionStatus.CANCELLED);
  assert.equal(canUsePaidEntitlements(cancelled, baseTime), false);
});

test("validates only known server-side plan limits", () => {
  assert.deepEqual(
    billingEntitlementsSchema.parse({
      maxPatients: 500,
      maxMonthlyAppointments: 1000,
    }),
    {
      maxPatients: 500,
      maxMonthlyAppointments: 1000,
    },
  );
  assert.equal(
    billingEntitlementsSchema.safeParse({
      maxPatients: -1,
      admin: true,
    }).success,
    false,
  );
});

test("billing ownership is bound to the authenticated clinic membership", () => {
  const userA = "10000000-0000-4000-8000-000000000001";
  const userB = "10000000-0000-4000-8000-000000000002";
  const clinicA = "20000000-0000-4000-8000-000000000001";
  const clinicB = "20000000-0000-4000-8000-000000000002";
  const owner = authorizeClinicMembership(userA, clinicA, {
    userId: userA,
    clinicId: clinicA,
    role: ClinicRole.OWNER,
  });

  assert.equal(
    authorizeClinicRole(owner, [ClinicRole.OWNER]).clinicId,
    clinicA,
  );
  assert.throws(
    () =>
      authorizeClinicMembership(userA, clinicB, {
        userId: userB,
        clinicId: clinicB,
        role: ClinicRole.OWNER,
      }),
    ClinicAccessDeniedError,
  );

  const staff = authorizeClinicMembership(userA, clinicA, {
    userId: userA,
    clinicId: clinicA,
    role: ClinicRole.STAFF,
  });
  assert.throws(
    () => authorizeClinicRole(staff, [ClinicRole.OWNER]),
    ClinicRoleDeniedError,
  );
});
