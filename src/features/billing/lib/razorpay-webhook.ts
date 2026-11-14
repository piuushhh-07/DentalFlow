import "server-only";

import {
  BillingPaymentStatus,
  BillingSubscriptionStatus,
  BillingWebhookStatus,
  Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  canApplyRazorpayEvent,
  isWebhookClaimAvailable,
  nextBillingSubscriptionState,
} from "@/features/billing/lib/billing-validation";

const eventEnvelopeSchema = z.object({
  event: z.string().min(1).max(120),
  created_at: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
});

const supportedSubscriptionEvents = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.completed",
  "subscription.updated",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.paused",
  "subscription.resumed",
]);

const eventLeaseMs = 5 * 60 * 1000;

type SanitizedPayment = Readonly<{
  id: string;
  amount: number;
  currency: string;
  status: string | null;
  errorCode: string | null;
  invoiceId: string | null;
  createdAt: Date | null;
}>;

type ParsedRazorpayEvent = Readonly<{
  eventId: string;
  eventType: string;
  eventCreatedAt: Date;
  payload: Prisma.InputJsonObject;
  subscription: Readonly<{
    id: string;
    status: string;
    customerId: string | null;
    currentStart: Date | null;
    currentEnd: Date | null;
  }> | null;
  payment: SanitizedPayment | null;
}>;

export class InvalidRazorpayEventError extends Error {}
export class RazorpayWebhookEventConflictError extends Error {}
export class RazorpayWebhookProcessingBusyError extends Error {}
export class UnknownRazorpaySubscriptionError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalizeJson(nestedValue)]),
  );
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readEpochDate(
  record: Record<string, unknown>,
  key: string,
): Date | null {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000)
    : null;
}

function parsePayment(value: unknown): SanitizedPayment | null {
  const entity = asRecord(asRecord(value)?.entity);
  if (!entity) return null;

  const id = readString(entity, "id");
  const currency = readString(entity, "currency");
  const amount = entity.amount;
  if (
    !id ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 0
  ) {
    throw new InvalidRazorpayEventError(
      "The provider payment entity is incomplete.",
    );
  }

  return {
    id,
    amount,
    currency,
    status: readString(entity, "status"),
    errorCode: readString(entity, "error_code"),
    invoiceId: readString(entity, "invoice_id"),
    createdAt: readEpochDate(entity, "created_at"),
  };
}

export function parseRazorpaySubscriptionEvent(
  eventId: string,
  rawBody: string,
): ParsedRazorpayEvent {
  if (!eventId || eventId.length > 120) {
    throw new InvalidRazorpayEventError(
      "A valid provider event ID is required.",
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    throw new InvalidRazorpayEventError(
      "The provider event is not valid JSON.",
    );
  }

  const envelope = eventEnvelopeSchema.safeParse(decoded);
  if (!envelope.success) {
    throw new InvalidRazorpayEventError("The provider event is malformed.");
  }

  const eventCreatedAt = new Date(envelope.data.created_at * 1000);
  const eventType = envelope.data.event;
  if (!supportedSubscriptionEvents.has(eventType)) {
    return {
      eventId,
      eventType,
      eventCreatedAt,
      payload: { eventType },
      subscription: null,
      payment: null,
    };
  }

  const subscriptionEntity = asRecord(
    asRecord(envelope.data.payload.subscription)?.entity,
  );
  const subscriptionId = subscriptionEntity
    ? readString(subscriptionEntity, "id")
    : null;
  const providerStatus = subscriptionEntity
    ? readString(subscriptionEntity, "status")
    : null;
  if (!subscriptionEntity || !subscriptionId || !providerStatus) {
    throw new InvalidRazorpayEventError(
      "The provider subscription entity is incomplete.",
    );
  }

  const payment = parsePayment(envelope.data.payload.payment);
  const sanitizedSubscription = {
    id: subscriptionId,
    status: providerStatus,
    customerId: readString(subscriptionEntity, "customer_id"),
    currentStart: readEpochDate(subscriptionEntity, "current_start"),
    currentEnd: readEpochDate(subscriptionEntity, "current_end"),
  };
  const sanitizedPayload: Prisma.InputJsonObject = {
    eventType,
    subscription: {
      id: sanitizedSubscription.id,
      status: sanitizedSubscription.status,
      customerId: sanitizedSubscription.customerId,
      currentStart: sanitizedSubscription.currentStart?.toISOString() ?? null,
      currentEnd: sanitizedSubscription.currentEnd?.toISOString() ?? null,
    },
    payment: payment
      ? {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          errorCode: payment.errorCode,
          invoiceId: payment.invoiceId,
          createdAt: payment.createdAt?.toISOString() ?? null,
        }
      : null,
  };

  return {
    eventId,
    eventType,
    eventCreatedAt,
    payload: sanitizedPayload,
    subscription: sanitizedSubscription,
    payment,
  };
}

async function storeWebhookEvent(event: ParsedRazorpayEvent) {
  try {
    return await prisma.billingWebhookEvent.create({
      data: {
        providerEventId: event.eventId,
        eventType: event.eventType,
        eventCreatedAt: event.eventCreatedAt,
        payload: event.payload,
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const existing = await prisma.billingWebhookEvent.findUnique({
      where: { providerEventId: event.eventId },
    });
    if (!existing) throw error;
    if (
      existing.eventType !== event.eventType ||
      existing.eventCreatedAt.getTime() !== event.eventCreatedAt.getTime() ||
      JSON.stringify(canonicalizeJson(existing.payload)) !==
        JSON.stringify(canonicalizeJson(event.payload))
    ) {
      throw new RazorpayWebhookEventConflictError(
        "A provider event ID was reused with different content.",
      );
    }
    return existing;
  }
}

async function claimWebhookEvent(eventId: string): Promise<Date | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - eventLeaseMs);
  const event = await prisma.billingWebhookEvent.findUnique({
    where: { providerEventId: eventId },
    select: { status: true, processingStartedAt: true },
  });
  if (!event) throw new Error("The persisted provider event is unavailable.");
  if (event.status === BillingWebhookStatus.PROCESSED) return null;
  if (
    !isWebhookClaimAvailable(
      event.status,
      event.processingStartedAt,
      now,
      eventLeaseMs,
    )
  ) {
    throw new RazorpayWebhookProcessingBusyError(
      "The provider event is already being processed.",
    );
  }

  const claimed = await prisma.billingWebhookEvent.updateMany({
    where: {
      providerEventId: eventId,
      OR: [
        {
          status: {
            in: [BillingWebhookStatus.PENDING, BillingWebhookStatus.FAILED],
          },
        },
        {
          status: BillingWebhookStatus.PROCESSING,
          processingStartedAt: { lte: staleBefore },
        },
      ],
    },
    data: {
      status: BillingWebhookStatus.PROCESSING,
      processingStartedAt: now,
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  if (claimed.count === 1) return now;
  const latest = await prisma.billingWebhookEvent.findUnique({
    where: { providerEventId: eventId },
    select: { status: true },
  });
  if (latest?.status === BillingWebhookStatus.PROCESSED) return null;
  throw new RazorpayWebhookProcessingBusyError(
    "The provider event is already being processed.",
  );
}

async function persistPayment(
  transaction: Prisma.TransactionClient,
  event: ParsedRazorpayEvent,
  subscription: { id: string; clinicId: string },
): Promise<void> {
  const payment = event.payment;
  if (!payment) return;

  const paymentStatus =
    event.eventType === "subscription.charged"
      ? BillingPaymentStatus.SUCCEEDED
      : event.eventType === "subscription.pending" ||
          event.eventType === "subscription.halted"
        ? BillingPaymentStatus.FAILED
        : null;
  if (!paymentStatus) return;

  const existing = await transaction.billingPayment.findUnique({
    where: { providerPaymentId: payment.id },
    select: {
      id: true,
      clinicId: true,
      subscriptionId: true,
      status: true,
    },
  });
  if (existing) {
    if (
      existing.clinicId !== subscription.clinicId ||
      existing.subscriptionId !== subscription.id
    ) {
      throw new Error(
        "The provider payment is associated with another clinic.",
      );
    }
    if (
      paymentStatus === BillingPaymentStatus.SUCCEEDED &&
      existing.status !== BillingPaymentStatus.SUCCEEDED
    ) {
      await transaction.billingPayment.updateMany({
        where: { id: existing.id, clinicId: subscription.clinicId },
        data: {
          status: BillingPaymentStatus.SUCCEEDED,
          paidAt: payment.createdAt ?? event.eventCreatedAt,
          failureCode: null,
        },
      });
    }
    return;
  }

  await transaction.billingPayment.create({
    data: {
      clinicId: subscription.clinicId,
      subscriptionId: subscription.id,
      providerPaymentId: payment.id,
      providerInvoiceId: payment.invoiceId,
      amountMinor: payment.amount,
      currency: payment.currency,
      status: paymentStatus,
      failureCode:
        paymentStatus === BillingPaymentStatus.FAILED
          ? (payment.errorCode?.slice(0, 120) ?? "PAYMENT_FAILED")
          : null,
      paidAt:
        paymentStatus === BillingPaymentStatus.SUCCEEDED
          ? (payment.createdAt ?? event.eventCreatedAt)
          : null,
    },
  });
}

async function applySubscriptionEvent(
  event: ParsedRazorpayEvent,
): Promise<void> {
  const providerSubscription = event.subscription;
  if (!providerSubscription) return;

  await prisma.$transaction(
    async (transaction) => {
      const subscription = await transaction.clinicSubscription.findUnique({
        where: { providerSubscriptionId: providerSubscription.id },
        select: {
          id: true,
          clinicId: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          trialEndsAt: true,
          graceUntil: true,
          cancelAtPeriodEnd: true,
          lastProviderEventCreatedAt: true,
          planVersion: { select: { graceDays: true } },
        },
      });
      if (!subscription) throw new UnknownRazorpaySubscriptionError();

      await persistPayment(transaction, event, subscription);
      if (
        !canApplyRazorpayEvent(
          subscription.lastProviderEventCreatedAt,
          event.eventCreatedAt,
        )
      ) {
        return;
      }

      const next = nextBillingSubscriptionState(
        {
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          graceUntil: subscription.graceUntil,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          lastProviderEventCreatedAt: subscription.lastProviderEventCreatedAt,
        },
        {
          eventType: event.eventType,
          eventCreatedAt: event.eventCreatedAt,
          providerStatus: providerSubscription.status,
        },
        subscription.planVersion.graceDays,
      );

      await transaction.clinicSubscription.updateMany({
        where: {
          id: subscription.id,
          clinicId: subscription.clinicId,
          OR: [
            { lastProviderEventCreatedAt: null },
            { lastProviderEventCreatedAt: { lt: event.eventCreatedAt } },
          ],
        },
        data: {
          status: next.status,
          lastProviderEventCreatedAt: event.eventCreatedAt,
          currentPeriodStart: providerSubscription.currentStart ?? undefined,
          currentPeriodEnd: providerSubscription.currentEnd ?? undefined,
          graceUntil: next.graceUntil,
          cancelAtPeriodEnd: next.cancelAtPeriodEnd,
          cancelledAt:
            next.status === BillingSubscriptionStatus.CANCELLED
              ? event.eventCreatedAt
              : undefined,
          providerCustomerId: providerSubscription.customerId ?? undefined,
        },
      });
    },
    { timeout: 10_000 },
  );
}

export async function processRazorpayWebhook(
  eventId: string,
  rawBody: string,
): Promise<"processed" | "duplicate"> {
  const event = parseRazorpaySubscriptionEvent(eventId, rawBody);
  const stored = await storeWebhookEvent(event);
  if (stored.status === BillingWebhookStatus.PROCESSED) return "duplicate";

  const claimStartedAt = await claimWebhookEvent(eventId);
  if (!claimStartedAt) return "duplicate";

  try {
    await applySubscriptionEvent(event);
    await prisma.billingWebhookEvent.updateMany({
      where: {
        providerEventId: eventId,
        status: BillingWebhookStatus.PROCESSING,
        processingStartedAt: claimStartedAt,
      },
      data: {
        status: BillingWebhookStatus.PROCESSED,
        processedAt: new Date(),
        processingStartedAt: null,
      },
    });
    return "processed";
  } catch (error) {
    await prisma.billingWebhookEvent.updateMany({
      where: {
        providerEventId: eventId,
        status: BillingWebhookStatus.PROCESSING,
        processingStartedAt: claimStartedAt,
      },
      data: {
        status: BillingWebhookStatus.FAILED,
        processingStartedAt: null,
        lastError:
          error instanceof UnknownRazorpaySubscriptionError
            ? "SUBSCRIPTION_NOT_LINKED"
            : "PROCESSING_FAILED",
      },
    });
    console.error("Razorpay webhook processing failed", {
      eventType: event.eventType,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}
