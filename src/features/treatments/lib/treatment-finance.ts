import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  FinancialEntryType,
  PaymentMethod,
  Prisma,
  TreatmentCatalogStatus,
  TreatmentPlanStatus,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  assertTreatmentDiscountWithinCost,
  assertTreatmentRefundWithinPayments,
  calculateTreatmentEntryAmount,
  calculateTreatmentLedgerBalance,
} from "@/features/treatments/lib/treatment-finance-rules";
import {
  treatmentCatalogueItemSchema,
  treatmentPlanFinanceSchema,
  type TreatmentFinancialEntryInput,
} from "@/features/treatments/lib/treatment-finance-validation";

export {
  treatmentCatalogueItemSchema,
  treatmentCatalogueStatusSchema,
  treatmentFinancialEntrySchema,
  treatmentPlanFinanceSchema,
} from "@/features/treatments/lib/treatment-finance-validation";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export const financialEntryTypeLabels: Record<FinancialEntryType, string> = {
  PAYMENT: "Payment",
  DISCOUNT: "Discount",
  REFUND: "Refund",
};

export type TreatmentFinancialSummary = Readonly<{
  estimate: number;
  final: number;
  discount: number;
  payments: number;
  refunds: number;
  outstanding: number;
  patientCredit: number;
  entries: Array<{
    id: string;
    entryType: FinancialEntryType;
    paymentMethod: PaymentMethod | null;
    amount: number;
    reference: string | null;
    notes: string | null;
    paidAt: Date;
    receiptNumber: string | null;
  }>;
}>;

function decimalNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value.toFixed(2)) : 0;
}

export async function listClinicTreatmentCatalogue(clinicId: string) {
  return prisma.treatmentCatalogueItem.findMany({
    where: { clinicId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      defaultPrice: true,
      status: true,
      updatedAt: true,
    },
  });
}

export async function saveClinicTreatmentCatalogueItem(
  clinicId: string,
  input: z.output<typeof treatmentCatalogueItemSchema>,
) {
  const data = {
    name: input.name,
    description: input.description?.trim() || null,
    defaultPrice:
      input.defaultPrice && input.defaultPrice.length > 0
        ? new Prisma.Decimal(input.defaultPrice)
        : null,
  };

  if (input.id) {
    const result = await prisma.treatmentCatalogueItem.updateMany({
      where: { id: input.id, clinicId },
      data,
    });
    if (result.count !== 1) throw new Error("Catalogue item not found.");
    return { id: input.id };
  }

  return prisma.treatmentCatalogueItem.create({
    data: { clinicId, ...data },
    select: { id: true },
  });
}

export async function setClinicTreatmentCatalogueItemStatus(
  clinicId: string,
  id: string,
  status: TreatmentCatalogStatus,
) {
  const result = await prisma.treatmentCatalogueItem.updateMany({
    where: { id, clinicId },
    data: { status },
  });
  if (result.count !== 1) throw new Error("Catalogue item not found.");
}

export async function updateTreatmentPlanFinance(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  input: z.output<typeof treatmentPlanFinanceSchema>,
) {
  return prisma.$transaction(
    async (transaction) => {
      const plan = await transaction.treatmentPlan.findFirst({
        where: { id: treatmentPlanId, clinicId, patientId },
        include: { visits: { select: { status: true } } },
      });
      if (!plan) throw new Error("Treatment plan not found.");
      if (plan.status === TreatmentPlanStatus.CANCELLED) {
        throw new Error("Cancelled treatment plans cannot be edited.");
      }
      if (
        input.status === TreatmentPlanStatus.COMPLETED &&
        plan.visits.some((visit) => visit.status !== "COMPLETED")
      ) {
        throw new Error(
          "Complete all planned visits before completing the plan.",
        );
      }
      if (input.catalogItemId) {
        const item = await transaction.treatmentCatalogueItem.findFirst({
          where: { id: input.catalogItemId, clinicId },
          select: { id: true, status: true },
        });
        if (!item)
          throw new Error("Choose an active treatment from this clinic.");
        if (
          item.status !== TreatmentCatalogStatus.ACTIVE &&
          plan.catalogItemId !== input.catalogItemId
        ) {
          throw new Error("Choose an active treatment from this clinic.");
        }
      }

      const discounts = await transaction.treatmentFinancialEntry.aggregate({
        _sum: { amount: true },
        where: {
          clinicId,
          treatmentPlanId,
          entryType: FinancialEntryType.DISCOUNT,
        },
      });

      const estimatedAmount =
        input.estimatedAmount === "" || input.estimatedAmount === undefined
          ? null
          : new Prisma.Decimal(input.estimatedAmount);
      const finalAmount =
        input.finalAmount === "" || input.finalAmount === undefined
          ? estimatedAmount
          : new Prisma.Decimal(input.finalAmount);
      await transaction.treatmentPlan.update({
        where: { id: plan.id },
        data: {
          estimatedAmount,
          finalAmount,
          catalogItemId: input.catalogItemId || null,
          discountAmount: discounts._sum.amount ?? new Prisma.Decimal(0),
          status: input.status,
          completedAt:
            input.status === TreatmentPlanStatus.COMPLETED
              ? (plan.completedAt ?? new Date())
              : null,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getTreatmentPlanFinancialSummary(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
): Promise<TreatmentFinancialSummary> {
  const [plan, entries] = await prisma.$transaction(
    async (transaction) =>
      Promise.all([
        transaction.treatmentPlan.findFirst({
          where: { id: treatmentPlanId, clinicId, patientId },
          select: { estimatedAmount: true, finalAmount: true },
        }),
        transaction.treatmentFinancialEntry.findMany({
          where: { clinicId, patientId, treatmentPlanId },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            entryType: true,
            paymentMethod: true,
            amount: true,
            reference: true,
            notes: true,
            paidAt: true,
            receiptNumber: true,
          },
        }),
      ]),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  if (!plan) throw new Error("The treatment plan could not be found.");

  const totals = entries.reduce(
    (accumulator, entry) => {
      if (entry.entryType === FinancialEntryType.PAYMENT)
        accumulator.payments = accumulator.payments.plus(entry.amount);
      if (entry.entryType === FinancialEntryType.REFUND)
        accumulator.refunds = accumulator.refunds.plus(entry.amount);
      if (entry.entryType === FinancialEntryType.DISCOUNT)
        accumulator.discounts = accumulator.discounts.plus(entry.amount);
      return accumulator;
    },
    {
      payments: new Prisma.Decimal(0),
      refunds: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
    },
  );
  const final =
    plan.finalAmount ?? plan.estimatedAmount ?? new Prisma.Decimal(0);
  const balance = calculateTreatmentLedgerBalance(final, totals);

  return {
    estimate: decimalNumber(plan.estimatedAmount),
    final: decimalNumber(final),
    discount: decimalNumber(totals.discounts),
    payments: decimalNumber(totals.payments),
    refunds: decimalNumber(totals.refunds),
    outstanding: balance.isPositive() ? decimalNumber(balance) : 0,
    patientCredit: balance.isNegative() ? decimalNumber(balance.abs()) : 0,
    entries: entries.map((entry) => ({
      id: entry.id,
      entryType: entry.entryType,
      paymentMethod: entry.paymentMethod,
      amount: decimalNumber(entry.amount),
      reference: entry.reference,
      notes: entry.notes,
      paidAt: entry.paidAt,
      receiptNumber: entry.receiptNumber,
    })),
  };
}

export async function createTreatmentPlanFinancialEntry(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  createdByUserId: string,
  input: TreatmentFinancialEntryInput,
) {
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        patientId,
        treatmentPlanId,
        createdByUserId,
        entryType: input.entryType,
        amount: input.amount,
        discountMode: input.discountMode ?? null,
        paymentMethod: input.paymentMethod ?? null,
        paidAt: input.paidAt,
      }),
    )
    .digest("hex");
  return prisma.$transaction(
    async (transaction) => {
      const existingRequest =
        await transaction.treatmentFinancialEntry.findFirst({
          where: { clinicId, requestKey: input.requestKey },
          select: {
            id: true,
            receiptNumber: true,
            patientId: true,
            treatmentPlanId: true,
            entryType: true,
            requestHash: true,
          },
        });
      if (existingRequest) {
        if (
          existingRequest.patientId === patientId &&
          existingRequest.treatmentPlanId === treatmentPlanId &&
          existingRequest.entryType === input.entryType &&
          existingRequest.requestHash === requestHash
        ) {
          return {
            id: existingRequest.id,
            receiptNumber: existingRequest.receiptNumber,
          };
        }
        throw new Error("This submission key has already been used.");
      }

      const plan = await transaction.treatmentPlan.findFirst({
        where: { id: treatmentPlanId, clinicId, patientId },
        select: {
          id: true,
          estimatedAmount: true,
          finalAmount: true,
          status: true,
        },
      });
      if (!plan) throw new Error("The treatment plan could not be found.");
      if (plan.status === TreatmentPlanStatus.CANCELLED) {
        throw new Error(
          "Financial entries cannot be added to a cancelled plan.",
        );
      }
      await transaction.treatmentPlan.update({
        where: { id: plan.id },
        data: { updatedAt: new Date() },
      });

      const previousEntries =
        await transaction.treatmentFinancialEntry.findMany({
          where: { clinicId, treatmentPlanId },
          select: { entryType: true, amount: true },
        });
      const totals = previousEntries.reduce(
        (sum, entry) => {
          if (entry.entryType === FinancialEntryType.PAYMENT)
            sum.payments = sum.payments.plus(entry.amount);
          if (entry.entryType === FinancialEntryType.REFUND)
            sum.refunds = sum.refunds.plus(entry.amount);
          if (entry.entryType === FinancialEntryType.DISCOUNT)
            sum.discounts = sum.discounts.plus(entry.amount);
          return sum;
        },
        {
          payments: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
          discounts: new Prisma.Decimal(0),
        },
      );
      const planTotal =
        plan.finalAmount ?? plan.estimatedAmount ?? new Prisma.Decimal(0);
      const amount = calculateTreatmentEntryAmount({
        entryType: input.entryType,
        submittedAmount: new Prisma.Decimal(input.amount),
        discountMode: input.discountMode,
        finalAmount: planTotal,
        priorDiscounts: totals.discounts,
      });
      if (!amount.isPositive())
        throw new Error("Enter an amount greater than zero.");
      if (input.entryType === FinancialEntryType.DISCOUNT) {
        assertTreatmentDiscountWithinCost(amount, planTotal, totals.discounts);
      }
      if (input.entryType === FinancialEntryType.REFUND) {
        assertTreatmentRefundWithinPayments(
          amount,
          totals.payments,
          totals.refunds,
        );
      }

      const next = {
        payments: totals.payments,
        refunds: totals.refunds,
        discounts: totals.discounts,
      };
      if (input.entryType === FinancialEntryType.PAYMENT)
        next.payments = next.payments.plus(amount);
      if (input.entryType === FinancialEntryType.REFUND)
        next.refunds = next.refunds.plus(amount);
      if (input.entryType === FinancialEntryType.DISCOUNT)
        next.discounts = next.discounts.plus(amount);
      const balanceAfter = calculateTreatmentLedgerBalance(planTotal, next);
      const receiptNumber =
        input.entryType === FinancialEntryType.PAYMENT
          ? `DF-${new Date(input.paidAt).toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8).toUpperCase()}`
          : null;

      const created = await transaction.treatmentFinancialEntry.create({
        data: {
          clinicId,
          patientId,
          treatmentPlanId,
          createdByUserId,
          entryType: input.entryType,
          paymentMethod:
            input.entryType === FinancialEntryType.PAYMENT
              ? (input.paymentMethod ?? PaymentMethod.OTHER)
              : null,
          amount,
          balanceAfter,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          receiptNumber,
          requestKey: input.requestKey,
          requestHash,
          paidAt: new Date(input.paidAt),
        },
        select: { id: true, receiptNumber: true },
      });

      if (input.entryType === FinancialEntryType.DISCOUNT) {
        await transaction.treatmentPlan.update({
          where: { id: plan.id },
          data: { discountAmount: next.discounts },
        });
      }
      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getTreatmentPaymentReceipt(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  entryId: string,
) {
  return prisma.treatmentFinancialEntry.findFirst({
    where: {
      id: entryId,
      clinicId,
      patientId,
      treatmentPlanId,
      entryType: FinancialEntryType.PAYMENT,
    },
    include: {
      clinic: { select: { name: true, phoneNumber: true, address: true } },
      patient: { select: { fullName: true } },
      treatmentPlan: { select: { name: true } },
    },
  });
}

export async function getClinicTreatmentFinanceSummary(clinicId: string) {
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const monthParts = Object.fromEntries(
    nowParts.map(({ type, value }) => [type, value]),
  );
  const monthStart = new Date(
    `${monthParts.year}-${monthParts.month}-01T00:00:00+05:30`,
  );
  const [entries, plans] = await prisma.$transaction(
    async (transaction) =>
      Promise.all([
        transaction.treatmentFinancialEntry.findMany({
          where: {
            clinicId,
            entryType: {
              in: [FinancialEntryType.PAYMENT, FinancialEntryType.REFUND],
            },
            paidAt: { gte: monthStart, lte: new Date() },
          },
          select: { entryType: true, amount: true, paidAt: true },
        }),
        transaction.treatmentPlan.findMany({
          where: { clinicId, status: { not: TreatmentPlanStatus.CANCELLED } },
          select: {
            id: true,
            finalAmount: true,
            estimatedAmount: true,
            financialEntries: { select: { entryType: true, amount: true } },
          },
        }),
      ]),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const collectionsThisMonth = entries.reduce(
    (sum, entry) =>
      entry.entryType === FinancialEntryType.PAYMENT
        ? sum.plus(entry.amount)
        : sum.minus(entry.amount),
    new Prisma.Decimal(0),
  );

  const outstanding = plans.reduce((sum, plan) => {
    const totals = plan.financialEntries.reduce(
      (result, entry) => {
        if (entry.entryType === FinancialEntryType.PAYMENT)
          result.payments = result.payments.plus(entry.amount);
        if (entry.entryType === FinancialEntryType.REFUND)
          result.refunds = result.refunds.plus(entry.amount);
        if (entry.entryType === FinancialEntryType.DISCOUNT)
          result.discounts = result.discounts.plus(entry.amount);
        return result;
      },
      {
        payments: new Prisma.Decimal(0),
        refunds: new Prisma.Decimal(0),
        discounts: new Prisma.Decimal(0),
      },
    );
    const final =
      plan.finalAmount ?? plan.estimatedAmount ?? new Prisma.Decimal(0);
    const balance = calculateTreatmentLedgerBalance(final, totals);
    return balance.isPositive() ? sum.plus(balance) : sum;
  }, new Prisma.Decimal(0));

  return {
    collectionsThisMonth: decimalNumber(
      collectionsThisMonth.isNegative()
        ? new Prisma.Decimal(0)
        : collectionsThisMonth,
    ),
    outstanding: decimalNumber(outstanding),
  };
}
