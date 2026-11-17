"use server";

import { ClinicRole, FinancialEntryType, PaymentMethod, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  assertFeatureEnabled,
  BillingAccessRestrictedError,
  BillingFeatureUnavailableError,
} from "@/features/billing/lib/billing-entitlements";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  clinicId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: z.coerce.number().finite().min(0).max(1_000_000_000),
  countedCash: z.coerce.number().finite().min(0).max(1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
});

function startOfLocalDate(date: string, timeZone: string): Date {
  const desired = new Date(`${date}T00:00:00.000Z`).getTime();
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second),
    );
    candidate += desired - represented;
  }
  return new Date(candidate);
}

function localDateInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export async function closeCashRegister(formData: FormData): Promise<never> {
  const parsed = schema.safeParse({
    clinicId: formData.get("clinicId"),
    businessDate: formData.get("businessDate"),
    openingCash: formData.get("openingCash"),
    countedCash: formData.get("countedCash"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");

  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const businessDate = new Date(`${parsed.data.businessDate}T00:00:00.000Z`);
  const nextBusinessDate = new Date(`${nextDate(parsed.data.businessDate)}T00:00:00.000Z`);

  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      const lockKey = `cash-register:${membership.clinicId}:${parsed.data.businessDate}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const existing = await tx.cashRegisterClose.findUnique({
        where: { clinicId_businessDate: { clinicId: membership.clinicId, businessDate } },
        select: { id: true },
      });
      if (existing) throw new Error("CASH_REGISTER_ALREADY_CLOSED");

      const clinic = await tx.clinic.findUnique({
        where: { id: membership.clinicId },
        select: { timeZone: true },
      });
      if (!clinic) throw new Error("CLINIC_NOT_FOUND");
      if (parsed.data.businessDate > localDateInZone(clinic.timeZone)) {
        throw new Error("CASH_REGISTER_FUTURE_DATE");
      }

      const startAt = startOfLocalDate(parsed.data.businessDate, clinic.timeZone);
      const endAt = startOfLocalDate(nextDate(parsed.data.businessDate), clinic.timeZone);
      const [entries, expenses, dentistPayoutPayments] = await Promise.all([
        tx.treatmentFinancialEntry.findMany({
          where: { clinicId: membership.clinicId, paidAt: { gte: startAt, lt: endAt } },
          select: { entryType: true, paymentMethod: true, amount: true },
        }),
        tx.clinicExpense.findMany({
          where: { clinicId: membership.clinicId, expenseDate: { gte: businessDate, lt: nextBusinessDate } },
          select: { paymentMethod: true, amount: true },
        }),
        tx.dentistPayoutPayment.findMany({
          where: {
            clinicId: membership.clinicId,
            paymentMethod: PaymentMethod.CASH,
            paidAt: { gte: startAt, lt: endAt },
          },
          select: { amount: true },
        }),
      ]);

      const zero = new Prisma.Decimal(0);
      const sumEntries = (method: PaymentMethod, type: FinancialEntryType) =>
        entries.filter((entry) => entry.paymentMethod === method && entry.entryType === type)
          .reduce((sum, entry) => sum.plus(entry.amount), zero);
      const cashCollections = sumEntries(PaymentMethod.CASH, FinancialEntryType.PAYMENT);
      const cashRefunds = sumEntries(PaymentMethod.CASH, FinancialEntryType.REFUND);
      const recordedCashExpenses = expenses.filter((expense) => expense.paymentMethod === PaymentMethod.CASH)
        .reduce((sum, expense) => sum.plus(expense.amount), zero);
      const cashDentistPayouts = dentistPayoutPayments
        .reduce((sum, payment) => sum.plus(payment.amount), zero);
      const cashExpenses = recordedCashExpenses.plus(cashDentistPayouts);
      const openingCash = new Prisma.Decimal(parsed.data.openingCash);
      const countedCash = new Prisma.Decimal(parsed.data.countedCash);
      const expectedCash = openingCash.plus(cashCollections).minus(cashRefunds).minus(cashExpenses);

      const collectionFor = (method: PaymentMethod) =>
        sumEntries(method, FinancialEntryType.PAYMENT).minus(sumEntries(method, FinancialEntryType.REFUND));

      await tx.cashRegisterClose.create({
        data: {
          clinicId: membership.clinicId,
          closedByUserId: membership.userId,
          businessDate,
          openingCash,
          cashCollections,
          cashRefunds,
          cashExpenses,
          expectedCash,
          countedCash,
          cashVariance: countedCash.minus(expectedCash),
          upiCollections: collectionFor(PaymentMethod.UPI),
          cardCollections: collectionFor(PaymentMethod.CARD),
          bankTransferCollections: collectionFor(PaymentMethod.BANK_TRANSFER),
          otherCollections: collectionFor(PaymentMethod.OTHER),
          notes: parsed.data.notes || null,
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) {
      redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=upgrade-required`);
    }
    if (error instanceof BillingAccessRestrictedError) {
      redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=subscription-restricted`);
    }
    if (error instanceof Error && error.message === "CASH_REGISTER_ALREADY_CLOSED") {
      redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=already-closed`);
    }
    if (error instanceof Error && error.message === "CASH_REGISTER_FUTURE_DATE") {
      redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=future-date`);
    }
    console.error("Cash register close failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=error`);
  }

  revalidatePath(`/clinic/${membership.clinicId}/finance/cashbook`);
  revalidatePath(`/clinic/${membership.clinicId}/reports`);
  redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=closed`);
}
