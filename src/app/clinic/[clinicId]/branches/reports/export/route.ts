import { AppointmentStatus, ClinicRole, FinancialEntryType } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { resolveBranchReportRange } from "@/features/clinic-groups/lib/branch-reporting";
import { formatReportDateRange } from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = typeof value === "string" && /^[=+@\\-\\t\\r]/.test(text)
    ? `'${text}`
    : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function csvResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  request: Request,
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

  const query = new URL(request.url).searchParams;
  const now = new Date();
  const selected = resolveBranchReportRange(
    now,
    group.clinics.find((clinic) => clinic.id === current.id)!.timeZone,
    query.get("range") ?? undefined,
    query.get("startDate") ?? undefined,
    query.get("endDate") ?? undefined,
  );
  if (selected.error) return csvResponse(selected.error, 400);

  const branches = await Promise.all(group.clinics.map(async (clinic) => {
    const { range } = resolveBranchReportRange(
      now,
      clinic.timeZone,
      selected.preset,
      query.get("startDate") ?? undefined,
      query.get("endDate") ?? undefined,
    );
    const [patients, appointments, financialEntries] = await Promise.all([
      prisma.patient.count({ where: { clinicId: clinic.id, archivedAt: null } }),
      prisma.appointment.count({
        where: {
          clinicId: clinic.id,
          scheduledAt: { gte: range.startAt, lt: range.endExclusiveAt },
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        },
      }),
      prisma.treatmentFinancialEntry.groupBy({
        by: ["entryType"],
        where: {
          clinicId: clinic.id,
          paidAt: { gte: range.startAt, lt: range.endExclusiveAt },
          entryType: { in: [FinancialEntryType.PAYMENT, FinancialEntryType.REFUND] },
        },
        _sum: { amount: true },
      }),
    ]);

    const payments = Number(financialEntries.find((entry) => entry.entryType === FinancialEntryType.PAYMENT)?._sum.amount ?? 0);
    const refunds = Number(financialEntries.find((entry) => entry.entryType === FinancialEntryType.REFUND)?._sum.amount ?? 0);
    return {
      name: clinic.name,
      timeZone: clinic.timeZone,
      range: formatReportDateRange(range),
      patients,
      appointments,
      payments,
      refunds,
      netCollections: payments - refunds,
    };
  }));

  const totals = branches.reduce((total, item) => ({
    patients: total.patients + item.patients,
    appointments: total.appointments + item.appointments,
    payments: total.payments + item.payments,
    refunds: total.refunds + item.refunds,
    netCollections: total.netCollections + item.netCollections,
  }), { patients: 0, appointments: 0, payments: 0, refunds: 0, netCollections: 0 });

  const rows: Array<Array<string | number>> = [
    ["Clinic group", group.name],
    ["Reporting period", selected.preset === "custom" ? "Custom dates" : selected.preset === "month" ? "This month" : `Last ${selected.preset} days`],
    [],
    ["Branch", "Branch reporting period", "Timezone", "Active patients (current)", "Appointments", "Payments (INR)", "Refunds (INR)", "Net collections (INR)"],
    ...branches.map((item) => [
      item.name,
      item.range,
      item.timeZone,
      item.patients,
      item.appointments,
      item.payments,
      item.refunds,
      item.netCollections,
    ]),
    ["Group total", "", "", totals.patients, totals.appointments, totals.payments, totals.refunds, totals.netCollections],
    [],
    ["Notes", "Active patient count is a current snapshot, not limited by selected date range."],
    ["Notes", "Appointments exclude cancelled and no-show records."],
    ["Notes", "Net collections equal recorded payments less recorded refunds; this is not accounting profit."],
    ["Notes", "Only aggregate values are included. No patient-level or clinical information is exported."],
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filenameDate = selected.range.endDate;
  return new Response(`\\uFEFF${csv}\\r\\n`, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="dentalflow-branch-report-${filenameDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
