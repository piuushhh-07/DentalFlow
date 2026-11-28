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
import {
  assertCashRegisterNotClosed,
  calculateCashbookReconciliation,
  collectionNetMinor,
  nextBusinessDate,
  requireCashbookPaymentMethod,
  startOfLocalDate,
} from "@/features/finance/lib/cashbook-reconciliation";
import { toMinorUnits } from "@/features/finance/lib/dentist-payouts";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  clinicId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: z.string().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number)
    .refine((amount) => Number.isFinite(amount) && amount <= 1_000_000_000),
  countedCash: z.string().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number)
    .refine((amount) => Number.isFinite(amount) && amount <= 1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
});

function localDateInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const nextDate = nextBusinessDate(parsed.data.businessDate);
  const nextBusinessDateValue = new Date(`${nextDate}T00:00:00.000Z`);

  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "expenseManagement");
      const lockKey = `cash-register:${membership.clinicId}:${parsed.data.businessDate}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL`;

      const existing = await tx.cashRegisterClose.findUnique({
        where: { clinicId_businessDate: { clinicId: membership.clinicId, businessDate } },
        select: { id: true },
      });
      assertCashRegisterNotClosed(existing !== null);

      const clinic = await tx.clinic.findUnique({
        where: { id: membership.clinicId },
        select: { timeZone: true },
      });
      if (!clinic) throw new Error("CLINIC_NOT_FOUND");
      if (parsed.data.businessDate > localDateInZone(clinic.timeZone)) {
        throw new Error("CASH_REGISTER_FUTURE_DATE");
      }

      const startAt = startOfLocalDate(parsed.data.businessDate, clinic.timeZone);
      const endAt = startOfLocalDate(nextDate, clinic.timeZone);
      const [entries, expenses, dentistPayoutPayments, vendorBillPayments] = await Promise.all([
        tx.treatmentFinancialEntry.findMany({
          where: {
            clinicId: membership.clinicId,
            entryType: { in: [FinancialEntryType.PAYMENT, FinancialEntryType.REFUND] },
            paidAt: { gte: startAt, lt: endAt },
          },
          select: { entryType: true, paymentMethod: true, amount: true },
        }),
        tx.clinicExpense.findMany({
          where: { clinicId: membership.clinicId, expenseDate: { gte: businessDate, lt: nextBusinessDateValue } },
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
        tx.vendorBillPayment.findMany({
          where: {
            clinicId: membership.clinicId,
            paymentMethod: PaymentMethod.CASH,
            paidAt: { gte: startAt, lt: endAt },
          },
          select: { paymentMethod: true, amount: true },
        }),
      ]);

      const cashEntries = entries.map((entry) => ({
        entryType: entry.entryType,
        paymentMethod: requireCashbookPaymentMethod(entry.paymentMethod),
        amountMinor: toMinorUnits(entry.amount.toString()),
      }));
      const openingCashMinor = toMinorUnits(parsed.data.openingCash);
      const countedCashMinor = toMinorUnits(parsed.data.countedCash);
      const reconciliation = calculateCashbookReconciliation({
        openingCashMinor,
        countedCashMinor,
        entries: cashEntries,
        clinicExpenses: expenses.map((expense) => ({
          paymentMethod: expense.paymentMethod,
          amountMinor: toMinorUnits(expense.amount.toString()),
        })),
        dentistPayouts: dentistPayoutPayments.map((payment) => ({
          paymentMethod: PaymentMethod.CASH,
          amountMinor: toMinorUnits(payment.amount.toString()),
        })),
        vendorBillPayments: vendorBillPayments.map((payment) => ({
          paymentMethod: payment.paymentMethod,
          amountMinor: toMinorUnits(payment.amount.toString()),
        })),
      });
      const toDecimal = (minorUnits: number) => new Prisma.Decimal(minorUnits).dividedBy(100);
      const collectionFor = (method: PaymentMethod) =>
        toDecimal(collectionNetMinor(cashEntries, method));

      await tx.cashRegisterClose.create({
        data: {
          clinicId: membership.clinicId,
          closedByUserId: membership.userId,
          businessDate,
          openingCash: toDecimal(openingCashMinor),
          cashCollections: toDecimal(reconciliation.cashCollections),
          cashRefunds: toDecimal(reconciliation.cashRefunds),
          cashExpenses: toDecimal(reconciliation.cashExpenses),
          expectedCash: toDecimal(reconciliation.expectedCash),
          countedCash: toDecimal(countedCashMinor),
          cashVariance: toDecimal(reconciliation.cashVariance),
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
    if (error instanceof Error && error.message === "CASHBOOK_ENTRY_MISSING_PAYMENT_METHOD") {
      redirect(`/clinic/${membership.clinicId}/finance/cashbook?status=unclassified-treatment-entry`);
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
