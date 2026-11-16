import "server-only";

import { Prisma } from "@prisma/client";

import {
  billingEntitlementsSchema,
  canUsePaidEntitlements,
  type BillingEntitlements,
  type BillingFeature,
} from "@/features/billing/lib/billing-validation";

export class BillingLimitReachedError extends Error {
  constructor(
    readonly limit:
      | "patients"
      | "monthlyAppointments"
      | "dentists"
      | "staff"
      | "branches",
  ) {
    super("The clinic has reached the limit for its current subscription.");
    this.name = "BillingLimitReachedError";
  }
}

export class BillingAccessRestrictedError extends Error {
  constructor() {
    super("The clinic subscription does not currently allow new records.");
    this.name = "BillingAccessRestrictedError";
  }
}

export class BillingFeatureUnavailableError extends Error {
  constructor(readonly feature: BillingFeature) {
    super("This feature is not included in the clinic's current subscription.");
    this.name = "BillingFeatureUnavailableError";
  }
}

export class InvalidBillingEntitlementsError extends Error {
  constructor() {
    super("The configured clinic plan has invalid entitlement limits.");
    this.name = "InvalidBillingEntitlementsError";
  }
}

type TransactionClient = Prisma.TransactionClient;

async function getCurrentEntitlements(
  transaction: TransactionClient,
  clinicId: string,
) {
  const subscription = await transaction.clinicSubscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      graceUntil: true,
      planVersion: { select: { entitlements: true } },
    },
  });

  if (!subscription) return null;
  if (!canUsePaidEntitlements(subscription)) {
    throw new BillingAccessRestrictedError();
  }

  const parsed = billingEntitlementsSchema.safeParse(
    subscription.planVersion.entitlements,
  );
  if (!parsed.success) throw new InvalidBillingEntitlementsError();
  return parsed.data;
}

/**
 * Enforce a module entitlement inside the same transaction as the operation.
 * Existing records remain readable; callers should use this only to gate
 * creation or mutation of the paid module's functionality.
 */
export async function assertFeatureEnabled(
  transaction: TransactionClient,
  clinicId: string,
  feature: BillingFeature,
): Promise<void> {
  const entitlements = await getCurrentEntitlements(transaction, clinicId);
  if (!entitlements?.features[feature]) {
    throw new BillingFeatureUnavailableError(feature);
  }
}

export async function assertPatientCapacity(
  transaction: TransactionClient,
  clinicId: string,
): Promise<void> {
  const entitlements = await getCurrentEntitlements(transaction, clinicId);
  const maximum = entitlements?.maxPatients;
  if (maximum === undefined || maximum === null) return;

  const patientCount = await transaction.patient.count({
    where: { clinicId },
  });
  if (patientCount >= maximum) throw new BillingLimitReachedError("patients");
}

export async function assertMonthlyAppointmentCapacity(
  transaction: TransactionClient,
  clinicId: string,
  now = new Date(),
): Promise<void> {
  const entitlements = await getCurrentEntitlements(transaction, clinicId);
  const maximum = entitlements?.maxMonthlyAppointments;
  if (maximum === undefined || maximum === null) return;

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const appointmentCount = await transaction.appointment.count({
    where: {
      clinicId,
      createdAt: { gte: monthStart, lt: nextMonthStart },
    },
  });
  if (appointmentCount >= maximum) {
    throw new BillingLimitReachedError("monthlyAppointments");
  }
}

export type { BillingEntitlements, BillingFeature };
