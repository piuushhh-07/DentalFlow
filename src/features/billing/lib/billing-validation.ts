import {
  BillingSubscriptionStatus,
  BillingWebhookStatus,
} from "@prisma/client";
import { z } from "zod";

export const billingEntitlementsSchema = z
  .object({
    maxPatients: z.number().int().positive().nullable().optional(),
    maxMonthlyAppointments: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type BillingEntitlements = z.infer<typeof billingEntitlementsSchema>;

export type BillingStateSnapshot = Readonly<{
  status: BillingSubscriptionStatus;
  lastProviderEventCreatedAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
}>;

export type RazorpaySubscriptionEvent = Readonly<{
  eventType: string;
  eventCreatedAt: Date;
  providerStatus: string;
}>;

export function canApplyRazorpayEvent(
  lastProviderEventCreatedAt: Date | null,
  eventCreatedAt: Date,
): boolean {
  return (
    lastProviderEventCreatedAt === null ||
    eventCreatedAt.getTime() > lastProviderEventCreatedAt.getTime()
  );
}

export function nextBillingSubscriptionState(
  current: BillingStateSnapshot,
  event: RazorpaySubscriptionEvent,
  graceDays: number,
): BillingStateSnapshot {
  if (
    !canApplyRazorpayEvent(
      current.lastProviderEventCreatedAt,
      event.eventCreatedAt,
    )
  ) {
    return current;
  }

  const result: BillingStateSnapshot = {
    ...current,
    lastProviderEventCreatedAt: event.eventCreatedAt,
  };

  switch (event.eventType) {
    case "subscription.authenticated":
      if (current.trialEndsAt && current.trialEndsAt > event.eventCreatedAt) {
        return { ...result, status: BillingSubscriptionStatus.TRIALING };
      }
      return result;
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      if (current.cancelAtPeriodEnd) {
        return {
          ...result,
          status: BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
          graceUntil: null,
        };
      }
      return {
        ...result,
        status: BillingSubscriptionStatus.ACTIVE,
        graceUntil: null,
      };
    case "subscription.pending":
      return {
        ...result,
        status: BillingSubscriptionStatus.PAST_DUE,
        graceUntil:
          current.graceUntil ?? addDays(event.eventCreatedAt, graceDays),
      };
    case "subscription.halted":
      return {
        ...result,
        status: BillingSubscriptionStatus.GRACE_PERIOD,
        graceUntil:
          current.graceUntil ?? addDays(event.eventCreatedAt, graceDays),
      };
    case "subscription.paused":
      return { ...result, status: BillingSubscriptionStatus.PAUSED };
    case "subscription.cancelled":
      return {
        ...result,
        status: BillingSubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
      };
    case "subscription.completed":
      return {
        ...result,
        status: BillingSubscriptionStatus.EXPIRED,
        cancelAtPeriodEnd: false,
      };
    case "subscription.updated":
      return withProviderStatus(
        result,
        event.providerStatus,
        event.eventCreatedAt,
        graceDays,
      );
    default:
      return result;
  }
}

function withProviderStatus(
  current: BillingStateSnapshot,
  providerStatus: string,
  eventCreatedAt: Date,
  graceDays: number,
): BillingStateSnapshot {
  switch (providerStatus) {
    case "authenticated":
      return current.trialEndsAt
        ? { ...current, status: BillingSubscriptionStatus.TRIALING }
        : current;
    case "active":
      if (current.cancelAtPeriodEnd) {
        return {
          ...current,
          status: BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
        };
      }
      return {
        ...current,
        status: BillingSubscriptionStatus.ACTIVE,
        graceUntil: null,
      };
    case "pending":
      return {
        ...current,
        status: BillingSubscriptionStatus.PAST_DUE,
        graceUntil: current.graceUntil ?? addDays(eventCreatedAt, graceDays),
      };
    case "halted":
      return {
        ...current,
        status: BillingSubscriptionStatus.GRACE_PERIOD,
        graceUntil: current.graceUntil ?? addDays(eventCreatedAt, graceDays),
      };
    case "paused":
      return { ...current, status: BillingSubscriptionStatus.PAUSED };
    case "cancelled":
      return {
        ...current,
        status: BillingSubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: false,
      };
    case "completed":
    case "expired":
      return {
        ...current,
        status: BillingSubscriptionStatus.EXPIRED,
        cancelAtPeriodEnd: false,
      };
    default:
      return current;
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function canUsePaidEntitlements(
  subscription: Pick<
    BillingStateSnapshot,
    "status" | "currentPeriodEnd" | "trialEndsAt" | "graceUntil"
  > | null,
  now = new Date(),
): boolean {
  if (!subscription) return true;

  switch (subscription.status) {
    case BillingSubscriptionStatus.TRIALING:
      return Boolean(
        subscription.trialEndsAt && subscription.trialEndsAt > now,
      );
    case BillingSubscriptionStatus.ACTIVE:
    case BillingSubscriptionStatus.CANCEL_AT_PERIOD_END:
      return (
        subscription.currentPeriodEnd === null ||
        subscription.currentPeriodEnd > now
      );
    case BillingSubscriptionStatus.PAST_DUE:
    case BillingSubscriptionStatus.GRACE_PERIOD:
      return Boolean(subscription.graceUntil && subscription.graceUntil > now);
    default:
      return false;
  }
}

export function isWebhookClaimAvailable(
  status: BillingWebhookStatus,
  processingStartedAt: Date | null,
  now: Date,
  leaseMs: number,
): boolean {
  if (
    status === BillingWebhookStatus.PENDING ||
    status === BillingWebhookStatus.FAILED
  ) {
    return true;
  }
  return (
    status === BillingWebhookStatus.PROCESSING &&
    processingStartedAt !== null &&
    now.getTime() - processingStartedAt.getTime() >= leaseMs
  );
}
