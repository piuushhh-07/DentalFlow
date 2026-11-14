import "server-only";

import { BillingSubscriptionStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
} from "@/features/billing/lib/razorpay-client";

export class BillingPlanUnavailableError extends Error {}
export class BillingSubscriptionAlreadyExistsError extends Error {}
export class BillingCheckoutConflictError extends Error {}
export class BillingSubscriptionNotFoundError extends Error {}

const CURRENT_STATUSES = [
  BillingSubscriptionStatus.CHECKOUT_PENDING,
  BillingSubscriptionStatus.TRIALING,
  BillingSubscriptionStatus.ACTIVE,
  BillingSubscriptionStatus.PAST_DUE,
  BillingSubscriptionStatus.GRACE_PERIOD,
  BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
  BillingSubscriptionStatus.PAUSED,
] as const;

export async function listAvailableBillingPlans() {
  const plans = await prisma.billingPlanVersion.findMany({
    where: {
      availableForSale: true,
      providerPlanId: { not: null },
    },
    orderBy: [{ code: "asc" }, { version: "desc" }],
    select: {
      id: true,
      code: true,
      version: true,
      displayName: true,
      description: true,
      currency: true,
      amountMinor: true,
      interval: true,
      intervalCount: true,
      trialDays: true,
      entitlements: true,
    },
  });

  const latestByCode = new Set<string>();
  return plans.filter((plan) => {
    if (latestByCode.has(plan.code)) return false;
    latestByCode.add(plan.code);
    return true;
  });
}

export async function getClinicBillingPortalData(clinicId: string) {
  return prisma.clinicSubscription.findFirst({
    where: { clinicId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      clinicId: true,
      status: true,
      checkoutUrl: true,
      checkoutExpiresAt: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceUntil: true,
      cancelAtPeriodEnd: true,
      createdAt: true,
      planVersion: {
        select: {
          displayName: true,
          code: true,
          version: true,
          currency: true,
          amountMinor: true,
          interval: true,
          intervalCount: true,
        },
      },
      payments: {
        where: { clinicId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          providerPaymentId: true,
          amountMinor: true,
          currency: true,
          status: true,
          failureCode: true,
          paidAt: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function startClinicSubscriptionCheckout(
  clinicId: string,
  planVersionId: string,
): Promise<{ checkoutUrl: string }> {
  const now = new Date();
  const plan = await prisma.billingPlanVersion.findFirst({
    where: {
      id: planVersionId,
      availableForSale: true,
      providerPlanId: { not: null },
    },
    select: {
      id: true,
      code: true,
      version: true,
      providerPlanId: true,
      totalBillingCycles: true,
      trialDays: true,
    },
  });
  if (!plan?.providerPlanId) throw new BillingPlanUnavailableError();

  let reservation: {
    subscriptionId: string | null;
    checkoutUrl: string | null;
    trialEndsAt: Date | null;
  };

  try {
    reservation = await prisma.$transaction(async (transaction) => {
      const lockKey = `clinic-billing-checkout:${clinicId}`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      const activeSubscription = await transaction.clinicSubscription.findFirst({
        where: { clinicId, status: { in: [...CURRENT_STATUSES] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          planVersionId: true,
          status: true,
          checkoutUrl: true,
          checkoutExpiresAt: true,
        },
      });
      const pendingCheckoutExpired =
        activeSubscription?.status ===
          BillingSubscriptionStatus.CHECKOUT_PENDING &&
        activeSubscription.checkoutExpiresAt !== null &&
        activeSubscription.checkoutExpiresAt <= now;

      if (pendingCheckoutExpired && activeSubscription) {
        await transaction.clinicSubscription.updateMany({
          where: {
            id: activeSubscription.id,
            clinicId,
            status: BillingSubscriptionStatus.CHECKOUT_PENDING,
          },
          data: { status: BillingSubscriptionStatus.FAILED },
        });
      } else if (activeSubscription) {
        if (
          activeSubscription.planVersionId === plan.id &&
          activeSubscription.checkoutUrl
        ) {
          return {
            subscriptionId: null,
            checkoutUrl: activeSubscription.checkoutUrl,
            trialEndsAt: null,
          };
        }
        throw new BillingSubscriptionAlreadyExistsError();
      }

      const previousTrial = await transaction.clinicSubscription.findFirst({
        where: { clinicId, trialStartedAt: { not: null } },
        select: { id: true },
      });
      const isTrialEligible = plan.trialDays > 0 && previousTrial === null;
      const trialEndsAt = isTrialEligible
        ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
        : null;

      const created = await transaction.clinicSubscription.create({
        data: {
          clinicId,
          planVersionId: plan.id,
          status: BillingSubscriptionStatus.CHECKOUT_PENDING,
          trialStartedAt: isTrialEligible ? now : null,
          trialEndsAt,
          checkoutExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      return {
        subscriptionId: created.id,
        checkoutUrl: null,
        trialEndsAt,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BillingCheckoutConflictError();
    }
    throw error;
  }

  if (reservation.checkoutUrl) {
    return { checkoutUrl: reservation.checkoutUrl };
  }
  if (!reservation.subscriptionId) {
    throw new BillingCheckoutConflictError();
  }
  const subscriptionId = reservation.subscriptionId;
  const trialEndsAt = reservation.trialEndsAt;

  try {
    const providerSubscription = await createRazorpaySubscription({
      planId: plan.providerPlanId,
      totalBillingCycles: plan.totalBillingCycles,
      trialEndsAt,
      localSubscriptionId: subscriptionId,
      clinicId,
      planCode: plan.code,
      planVersion: plan.version,
    });

    const updated = await prisma.clinicSubscription.updateMany({
      where: {
        id: subscriptionId,
        clinicId,
        status: BillingSubscriptionStatus.CHECKOUT_PENDING,
      },
      data: {
        providerSubscriptionId: providerSubscription.providerSubscriptionId,
        providerCustomerId: providerSubscription.providerCustomerId,
        checkoutUrl: providerSubscription.checkoutUrl,
        currentPeriodStart: providerSubscription.currentPeriodStart,
        currentPeriodEnd: providerSubscription.currentPeriodEnd,
      },
    });
    if (updated.count !== 1) {
      throw new Error("The clinic subscription changed during checkout setup.");
    }
    return { checkoutUrl: providerSubscription.checkoutUrl };
  } catch (error) {
    await prisma.clinicSubscription.updateMany({
      where: { id: subscriptionId, clinicId },
      data: {
        status: BillingSubscriptionStatus.FAILED,
        trialStartedAt: null,
        trialEndsAt: null,
      },
    });
    throw error;
  }
}

export async function cancelClinicSubscriptionAtPeriodEnd(
  clinicId: string,
): Promise<void> {
  const subscription = await prisma.clinicSubscription.findFirst({
    where: {
      clinicId,
      status: { in: [...CURRENT_STATUSES] },
      providerSubscriptionId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerSubscriptionId: true,
      status: true,
    },
  });
  if (!subscription?.providerSubscriptionId) {
    throw new BillingSubscriptionNotFoundError();
  }

  const providerResult = await cancelRazorpaySubscription(
    subscription.providerSubscriptionId,
    true,
  );
  const isCancelled = providerResult.status === "cancelled";
  await prisma.clinicSubscription.updateMany({
    where: { id: subscriptionId, clinicId },
    data: {
      status: isCancelled
        ? BillingSubscriptionStatus.CANCELLED
        : BillingSubscriptionStatus.CANCEL_AT_PERIOD_END,
      cancelAtPeriodEnd: !isCancelled,
      cancelledAt: isCancelled ? new Date() : null,
      currentPeriodStart: providerResult.currentPeriodStart ?? undefined,
      currentPeriodEnd: providerResult.currentPeriodEnd ?? undefined,
    },
  });
}
