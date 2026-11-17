"use server";

import { ClinicRole, DentistPayoutStatus, PaymentMethod, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  assertFeatureEnabled,
  BillingAccessRestrictedError,
  BillingFeatureUnavailableError,
} from "@/features/billing/lib/billing-entitlements";
import {
  getPayoutState,
  isPayoutOverpayment,
  toMinorUnits,
} from "@/features/finance/lib/dentist-payouts";
import { prisma } from "@/lib/db/prisma";

const payoutSchema = z.object({
  clinicId: z.string().uuid(),
  dentistId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(2).max(240),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => value.periodEnd >= value.periodStart, {
  message: "Period end cannot be before period start.",
  path: ["periodEnd"],
});

const paymentSchema = z.object({
  clinicId: z.string().uuid(),
  payoutId: z.string().uuid(),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

function payoutsPath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/finance/dentist-payouts?status=${status}`;
}

function localDateInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function createDentistPayout(formData: FormData): Promise<never> {
  const parsed = payoutSchema.safeParse({
    clinicId: formData.get("clinicId"),
    dentistId: formData.get("dentistId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");

  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      const clinic = await tx.clinic.findUnique({
        where: { id: membership.clinicId },
        select: { timeZone: true },
      });
      if (!clinic) throw new Error("CLINIC_NOT_FOUND");
      if (parsed.data.periodEnd > localDateInZone(clinic.timeZone)) {
        throw new Error("PAYOUT_FUTURE_PERIOD");
      }

      const lockKey = `dentist-payout-period:${membership.clinicId}:${parsed.data.dentistId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const dentist = await tx.clinicDentist.findFirst({
        where: { id: parsed.data.dentistId, clinicId: membership.clinicId, active: true },
        select: { id: true },
      });
      if (!dentist) throw new Error("PAYOUT_DENTIST_NOT_FOUND");

      const periodStart = new Date(`${parsed.data.periodStart}T00:00:00.000Z`);
      const periodEnd = new Date(`${parsed.data.periodEnd}T00:00:00.000Z`);
      const overlapping = await tx.dentistPayout.findFirst({
        where: {
          clinicId: membership.clinicId,
          dentistId: dentist.id,
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true },
      });
      if (overlapping) throw new Error("PAYOUT_PERIOD_OVERLAP");

      await tx.dentistPayout.create({
        data: {
          clinicId: membership.clinicId,
          dentistId: dentist.id,
          recordedByUserId: membership.userId,
          periodStart,
          periodEnd,
          description: parsed.data.description,
          amount: new Prisma.Decimal(parsed.data.amount),
          notes: parsed.data.notes || null,
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(payoutsPath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(payoutsPath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Error && error.message === "PAYOUT_PERIOD_OVERLAP") redirect(payoutsPath(membership.clinicId, "period-overlap"));
    if (error instanceof Error && error.message === "PAYOUT_FUTURE_PERIOD") redirect(payoutsPath(membership.clinicId, "future-period"));
    console.error("Dentist payout creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(payoutsPath(membership.clinicId, "error"));
  }

  revalidatePath(`/clinic/${membership.clinicId}/finance/dentist-payouts`);
  revalidatePath(`/clinic/${membership.clinicId}/finance/cashbook`);
  redirect(payoutsPath(membership.clinicId, "created"));
}

export async function recordDentistPayoutPayment(formData: FormData): Promise<never> {
  const parsed = paymentSchema.safeParse({
    clinicId: formData.get("clinicId"),
    payoutId: formData.get("payoutId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    paidAt: formData.get("paidAt"),
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");

  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      const clinic = await tx.clinic.findUnique({
        where: { id: membership.clinicId },
        select: { timeZone: true },
      });
      if (!clinic) throw new Error("CLINIC_NOT_FOUND");
      if (parsed.data.paidAt > localDateInZone(clinic.timeZone)) {
        throw new Error("PAYOUT_FUTURE_PAYMENT");
      }

      const lockKey = `dentist-payout-payment:${membership.clinicId}:${parsed.data.payoutId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const payout = await tx.dentistPayout.findFirst({
        where: {
          id: parsed.data.payoutId,
          clinicId: membership.clinicId,
          status: { not: DentistPayoutStatus.PAID },
        },
        select: { id: true, amount: true, status: true },
      });
      if (!payout) throw new Error("PAYOUT_NOT_PAYABLE");

      const paid = await tx.dentistPayoutPayment.aggregate({
        where: { payoutId: payout.id, clinicId: membership.clinicId },
        _sum: { amount: true },
      });
      const alreadyPaid = paid._sum.amount ?? new Prisma.Decimal(0);
      const paymentAmount = new Prisma.Decimal(parsed.data.amount);
      const totalMinor = toMinorUnits(payout.amount.toString());
      const alreadyPaidMinor = toMinorUnits(alreadyPaid.toString());
      const paymentMinor = toMinorUnits(paymentAmount.toString());
      if (isPayoutOverpayment(totalMinor, alreadyPaidMinor, paymentMinor)) {
        throw new Error("PAYOUT_OVERPAYMENT");
      }

      await tx.dentistPayoutPayment.create({
        data: {
          clinicId: membership.clinicId,
          payoutId: payout.id,
          recordedByUserId: membership.userId,
          amount: paymentAmount,
          paymentMethod: parsed.data.paymentMethod,
          paidAt: new Date(`${parsed.data.paidAt}T12:00:00.000Z`),
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
        },
      });

      const newPaidMinor = alreadyPaidMinor + paymentMinor;
      await tx.dentistPayout.update({
        where: { id: payout.id },
        data: { status: getPayoutState(totalMinor, newPaidMinor) },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(payoutsPath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(payoutsPath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Error && error.message === "PAYOUT_OVERPAYMENT") redirect(payoutsPath(membership.clinicId, "overpayment"));
    if (error instanceof Error && error.message === "PAYOUT_FUTURE_PAYMENT") redirect(payoutsPath(membership.clinicId, "future-payment"));
    console.error("Dentist payout payment failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(payoutsPath(membership.clinicId, "payment-error"));
  }

  revalidatePath(`/clinic/${membership.clinicId}/finance/dentist-payouts`);
  revalidatePath(`/clinic/${membership.clinicId}/finance/cashbook`);
  revalidatePath(`/clinic/${membership.clinicId}/expenses`);
  redirect(payoutsPath(membership.clinicId, "payment-recorded"));
}
