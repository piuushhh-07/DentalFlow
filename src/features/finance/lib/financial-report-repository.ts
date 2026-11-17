import "server-only";

import { Prisma, TreatmentPlanStatus } from "@prisma/client";

import { buildReceivablesAging, type ReceivablesAgingSummary } from "@/features/finance/lib/receivables-aging";
import { prisma } from "@/lib/db/prisma";

type ReceivablePlanRow = {
  id: string;
  patientName: string;
  patientPhone: string;
  treatmentName: string;
  openedAt: Date;
  billedAmount: Prisma.Decimal;
  discounts: Prisma.Decimal;
  payments: Prisma.Decimal;
  refunds: Prisma.Decimal;
};

function localDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getClinicReceivablesAging(
  clinicId: string,
  timeZone: string,
  now = new Date(),
): Promise<ReceivablesAgingSummary> {
  const asOfDate = new Date(`${localDateInZone(now, timeZone)}T00:00:00.000Z`);
  const rows = await prisma.$queryRaw<ReceivablePlanRow[]>\`
    SELECT
      tp."id",
      p."fullName" AS "patientName",
      p."phoneNumber" AS "patientPhone",
      tp."name" AS "treatmentName",
      tp."createdAt" AS "openedAt",
      COALESCE(tp."finalAmount", tp."estimatedAmount", 0)::numeric AS "billedAmount",
      COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'DISCOUNT'::"FinancialEntryType"
      ), 0)::numeric AS "discounts",
      COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'PAYMENT'::"FinancialEntryType"
      ), 0)::numeric AS "payments",
      COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'REFUND'::"FinancialEntryType"
      ), 0)::numeric AS "refunds"
    FROM "treatment_plans" tp
    INNER JOIN "patients" p
      ON p."id" = tp."patientId" AND p."clinicId" = tp."clinicId"
    LEFT JOIN "treatment_financial_entries" tfe
      ON tfe."treatmentPlanId" = tp."id" AND tfe."clinicId" = tp."clinicId"
    WHERE tp."clinicId" = ${clinicId}::uuid
      AND tp."status" <> ${TreatmentPlanStatus.CANCELLED}::"TreatmentPlanStatus"
    GROUP BY tp."id", p."fullName", p."phoneNumber", tp."name",
      tp."createdAt", tp."finalAmount", tp."estimatedAmount"
    HAVING (
      COALESCE(tp."finalAmount", tp."estimatedAmount", 0)
      - COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'DISCOUNT'::"FinancialEntryType"
      ), 0)
      - COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'PAYMENT'::"FinancialEntryType"
      ), 0)
      + COALESCE(SUM(tfe."amount") FILTER (
        WHERE tfe."entryType" = 'REFUND'::"FinancialEntryType"
      ), 0)
    ) > 0
    ORDER BY tp."createdAt" ASC
  \`;

  return buildReceivablesAging(rows.map((row) => ({
    ...row,
    openedAt: new Date(`${localDateInZone(row.openedAt, timeZone)}T00:00:00.000Z`),
    billedAmount: row.billedAmount.toString(),
    discounts: row.discounts.toString(),
    payments: row.payments.toString(),
    refunds: row.refunds.toString(),
  })), asOfDate);
}
