import { AppointmentStatus, ClinicRole, FinancialEntryType } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { buildBranchTrendPeriods } from "@/features/clinic-groups/lib/branch-trends";
import { serializeBranchTrendCsv } from "@/features/clinic-groups/lib/branch-trend-csv";
import { getClinicReportDateRangeForDates } from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function safeAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError("A branch trend amount is outside the safe range.");
  }
  return amount;
}

function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("A branch trend count is outside the safe range.");
  }
  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: { clinicId: string } },
) {
  const parsedId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedId.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(parsedId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicRoleDeniedError || error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const current = await prisma.clinic.findFirst({
    where: { id: owner.clinicId },
    select: { id: true, clinicGroupId: true },
  });
  if (!current?.clinicGroupId) notFound();

  const group = await prisma.clinicGroup.findFirst({
    where: {
      id: current.clinicGroupId,
      ownerUserId: owner.userId,
      clinics: { some: { id: current.id } },
    },
    select: {
      name: true,
      clinics: {
        where: {
          memberships: {
            some: {
              userId: owner.userId,
              role: ClinicRole.OWNER,
              active: true,
              revokedAt: null,
            },
          },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, timeZone: true },
      },
    },
  });
  if (!group || group.clinics.length < 2 || !group.clinics.some((clinic) => clinic.id === current.id)) notFound();

  const now = new Date();
  const reportingTimeZone = group.clinics.find((clinic) => clinic.id === current.id)!.timeZone;
  const anchorPeriods = buildBranchTrendPeriods(now, reportingTimeZone, 12);
  const branches = await Promise.all(group.clinics.map(async (clinic) => {
    const monthly = await Promise.all(anchorPeriods.map(async (period) => {
      const range = getClinicReportDateRangeForDates(
        period.range.startDate,
        period.range.endDate,
        clinic.timeZone,
      );
      const [financialEntries, appointments] = await Promise.all([
        prisma.treatmentFinancialEntry.groupBy({
          by: ["entryType"],
          where: {
            clinicId: clinic.id,
            paidAt: { gte: range.startAt, lt: range.endExclusiveAt },
            entryType: { in: [FinancialEntryType.PAYMENT, FinancialEntryType.REFUND] },
          },
          _sum: { amount: true },
        }),
        prisma.appointment.count({
          where: {
            clinicId: clinic.id,
            scheduledAt: { gte: range.startAt, lt: range.endExclusiveAt },
            status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          },
        }),
      ]);
      const payments = safeAmount(financialEntries.find((entry) => entry.entryType === FinancialEntryType.PAYMENT)?._sum.amount);
      const refunds = safeAmount(financialEntries.find((entry) => entry.entryType === FinancialEntryType.REFUND)?._sum.amount);
      return {
        key: period.key,
        label: period.label,
        payments,
        refunds,
        netCollections: payments - refunds,
        appointments: safeCount(appointments),
      };
    }));
    return { id: clinic.id, name: clinic.name, timeZone: clinic.timeZone, monthly };
  }));

  const rows: Array<Array<string | number>> = [
    ["Clinic group", group.name],
    ["Reporting window", "Last 12 calendar months (month labels based on the owner clinic timezone)"],
    [],
    ["Month", "Branch", "Branch timezone", "Payments (INR)", "Refunds (INR)", "Net collections (INR)", "Appointments"],
  ];

  for (let monthIndex = 0; monthIndex < anchorPeriods.length; monthIndex += 1) {
    const groupTotals = branches.reduce((totals, branch) => {
      const item = branch.monthly[monthIndex];
      totals.payments += item.payments;
      totals.refunds += item.refunds;
      totals.netCollections += item.netCollections;
      totals.appointments += item.appointments;
      return totals;
    }, { payments: 0, refunds: 0, netCollections: 0, appointments: 0 });

    for (const branch of branches) {
      const item = branch.monthly[monthIndex];
      rows.push([
        item.label,
        branch.name,
        branch.timeZone,
        item.payments,
        item.refunds,
        item.netCollections,
        item.appointments,
      ]);
    }

    rows.push([
      anchorPeriods[monthIndex].label,
      "GROUP TOTAL",
      "",
      groupTotals.payments,
      groupTotals.refunds,
      groupTotals.netCollections,
      groupTotals.appointments,
    ]);
  }

  rows.push(
    [],
    ["Notes", "Payments and refunds are grouped by recorded paid date."],
    ["Notes", "Net collections equal recorded payments less recorded refunds; this is not accounting profit."],
    ["Notes", "Appointments are grouped by scheduled date and exclude cancelled and no-show records."],
    ["Notes", "Each branch uses its own timezone for date boundaries; month labels follow the owner clinic timezone."],
    ["Notes", "Only aggregate values are exported. No patient-level or clinical information is included."],
  );

  const csv = serializeBranchTrendCsv(rows);
  const filenameDate = anchorPeriods[anchorPeriods.length - 1].key;
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="dentalflow-branch-financial-trends-${filenameDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
