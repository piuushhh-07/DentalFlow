import "server-only";

import {
  MessageLogStatus,
  PreventiveRecallStatus,
  TreatmentPlanStatus,
  TreatmentVisitStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { ClinicReportDateRange } from "@/features/reports/lib/report-validation";

export type ClinicReportMetrics = Readonly<{
  activePatients: number;
  appointments: number;
  pendingTreatmentVisits: number;
  overdueTreatmentVisits: number;
  pendingPreventiveRecalls: number;
  overduePreventiveRecalls: number;
  manuallyRecordedWhatsAppMessages: number;
  confirmedFollowUps: number;
  completedTreatmentPlans: number;
}>;

type DatabaseReportMetrics = Readonly<{
  activePatients: bigint;
  appointments: bigint;
  pendingTreatmentVisits: bigint;
  overdueTreatmentVisits: bigint;
  pendingPreventiveRecalls: bigint;
  overduePreventiveRecalls: bigint;
  manuallyRecordedWhatsAppMessages: bigint;
  confirmedFollowUps: bigint;
  completedTreatmentPlans: bigint;
}>;

function toSafeCount(value: bigint): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("A clinic report count is outside the safe range.");
  }
  return count;
}

export async function getClinicReportMetrics(
  clinicId: string,
  range: ClinicReportDateRange,
): Promise<ClinicReportMetrics> {
  const [counts] = await prisma.$queryRaw<DatabaseReportMetrics[]>`
    SELECT
      (
        SELECT COUNT(*)
        FROM "patients" p
        WHERE p."clinicId" = ${clinicId}::uuid
      ) AS "activePatients",
      (
        SELECT COUNT(*)
        FROM "appointments" a
        WHERE a."clinicId" = ${clinicId}::uuid
          AND a."scheduledAt" >= ${range.startAt}::timestamptz
          AND a."scheduledAt" < ${range.endExclusiveAt}::timestamptz
          AND a."status" NOT IN ('CANCELLED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus")
      ) AS "appointments",
      (
        SELECT COUNT(*)
        FROM "treatment_visits" tv
        WHERE tv."clinicId" = ${clinicId}::uuid
          AND tv."dueDate" >= ${range.endDate}::date
          AND tv."status" IN (
            ${TreatmentVisitStatus.PENDING}::"TreatmentVisitStatus",
            ${TreatmentVisitStatus.RESCHEDULED}::"TreatmentVisitStatus"
          )
          AND EXISTS (
            SELECT 1
            FROM "treatment_plans" tp
            WHERE tp."id" = tv."treatmentPlanId"
              AND tp."clinicId" = tv."clinicId"
              AND tp."status" <> ${TreatmentPlanStatus.CANCELLED}::"TreatmentPlanStatus"
          )
      ) AS "pendingTreatmentVisits",
      (
        SELECT COUNT(*)
        FROM "treatment_visits" tv
        WHERE tv."clinicId" = ${clinicId}::uuid
          AND tv."dueDate" < ${range.endDate}::date
          AND tv."status" IN (
            ${TreatmentVisitStatus.PENDING}::"TreatmentVisitStatus",
            ${TreatmentVisitStatus.REMINDER_SENT}::"TreatmentVisitStatus",
            ${TreatmentVisitStatus.CONFIRMED}::"TreatmentVisitStatus",
            ${TreatmentVisitStatus.RESCHEDULED}::"TreatmentVisitStatus",
            ${TreatmentVisitStatus.NO_RESPONSE}::"TreatmentVisitStatus"
          )
          AND EXISTS (
            SELECT 1
            FROM "treatment_plans" tp
            WHERE tp."id" = tv."treatmentPlanId"
              AND tp."clinicId" = tv."clinicId"
              AND tp."status" <> ${TreatmentPlanStatus.CANCELLED}::"TreatmentPlanStatus"
          )
      ) AS "overdueTreatmentVisits",
      (
        SELECT COUNT(*)
        FROM "preventive_recalls" r
        WHERE r."clinicId" = ${clinicId}::uuid
          AND r."status" = ${PreventiveRecallStatus.ACTIVE}::"PreventiveRecallStatus"
          AND r."dueDate" >= ${range.endDate}::date
      ) AS "pendingPreventiveRecalls",
      (
        SELECT COUNT(*)
        FROM "preventive_recalls" r
        WHERE r."clinicId" = ${clinicId}::uuid
          AND r."status" = ${PreventiveRecallStatus.ACTIVE}::"PreventiveRecallStatus"
          AND r."dueDate" < ${range.endDate}::date
      ) AS "overduePreventiveRecalls",
      (
        SELECT COUNT(*)
        FROM "message_logs" ml
        WHERE ml."clinicId" = ${clinicId}::uuid
          AND ml."channel" = 'WHATSAPP'
          AND ml."status" = ${MessageLogStatus.MANUALLY_RECORDED_SENT}::"MessageLogStatus"
          AND ml."manuallyConfirmedSentAt" >= ${range.startAt}::timestamptz
          AND ml."manuallyConfirmedSentAt" < ${range.endExclusiveAt}::timestamptz
      ) AS "manuallyRecordedWhatsAppMessages",
      (
        SELECT COUNT(*)
        FROM "treatment_visits" tv
        WHERE tv."clinicId" = ${clinicId}::uuid
          AND tv."status" = ${TreatmentVisitStatus.CONFIRMED}::"TreatmentVisitStatus"
          AND tv."dueDate" >= ${range.startDate}::date
          AND tv."dueDate" < ${range.endExclusiveDate}::date
          AND EXISTS (
            SELECT 1
            FROM "treatment_plans" tp
            WHERE tp."id" = tv."treatmentPlanId"
              AND tp."clinicId" = tv."clinicId"
              AND tp."status" <> ${TreatmentPlanStatus.CANCELLED}::"TreatmentPlanStatus"
          )
      ) AS "confirmedFollowUps",
      (
        SELECT COUNT(*)
        FROM "treatment_plans" tp
        WHERE tp."clinicId" = ${clinicId}::uuid
          AND tp."status" = ${TreatmentPlanStatus.COMPLETED}::"TreatmentPlanStatus"
          AND tp."completedAt" >= ${range.startAt}::timestamptz
          AND tp."completedAt" < ${range.endExclusiveAt}::timestamptz
      ) AS "completedTreatmentPlans"
  `;

  if (!counts) throw new Error("The clinic report query returned no result.");
  return {
    activePatients: toSafeCount(counts.activePatients),
    appointments: toSafeCount(counts.appointments),
    pendingTreatmentVisits: toSafeCount(counts.pendingTreatmentVisits),
    overdueTreatmentVisits: toSafeCount(counts.overdueTreatmentVisits),
    pendingPreventiveRecalls: toSafeCount(counts.pendingPreventiveRecalls),
    overduePreventiveRecalls: toSafeCount(counts.overduePreventiveRecalls),
    manuallyRecordedWhatsAppMessages: toSafeCount(
      counts.manuallyRecordedWhatsAppMessages,
    ),
    confirmedFollowUps: toSafeCount(counts.confirmedFollowUps),
    completedTreatmentPlans: toSafeCount(counts.completedTreatmentPlans),
  };
}

export type ClinicExpenseReportSummary = Readonly<{
  total: number;
  transactions: number;
  byCategory: Array<{ category: string; amount: number }>;
}>;

export async function getClinicExpenseReportSummary(
  clinicId: string,
  timeZone: string,
): Promise<ClinicExpenseReportSummary> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const monthStart = new Date(
    values.year + "-" + values.month + "-01T00:00:00.000Z",
  );
  const nextMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const [aggregate, categories] = await Promise.all([
    prisma.clinicExpense.aggregate({
      where: { clinicId, expenseDate: { gte: monthStart, lt: nextMonth } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.clinicExpense.groupBy({
      by: ["category"],
      where: { clinicId, expenseDate: { gte: monthStart, lt: nextMonth } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);
  return {
    total: Number(aggregate._sum.amount ?? 0),
    transactions: aggregate._count._all,
    byCategory: categories.map((item) => ({
      category: item.category,
      amount: Number(item._sum.amount ?? 0),
    })),
  };
}
