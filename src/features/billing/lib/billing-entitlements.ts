import "server-only";

import { Prisma } from "@prisma/client";

import {
  billingEntitlementsSchema,
  canUsePaidEntitlements,
  type BillingEntitlements,
} from "@/features/billing/lib/billing-validation";

export class BillingLimitReachedError extends Error {
  constructor(readonly limit: "patients" | "monthlyAppointments") {
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

export type { BillingEntitlements };
