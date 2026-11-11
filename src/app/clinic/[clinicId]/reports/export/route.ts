import { notFound } from "next/navigation";
import { z } from "zod";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { getClinicExpenseReportSummary, getClinicReportMetrics } from "@/features/reports/lib/report-repository";
import {
  formatReportDateRange,
  getClinicReportDateRange,
} from "@/features/reports/lib/report-validation";
import { getClinicTreatmentFinanceSummary } from "@/features/treatments/lib/treatment-finance";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: { clinicId: string } },
) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  const membership = await requireClinicMembership(parsedClinicId.data);
  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, timeZone: true },
  });
  if (!clinic) notFound();

  const range = getClinicReportDateRange(new Date(), clinic.timeZone);
  const [metrics, financialSummary, expenseSummary] = await Promise.all([
    getClinicReportMetrics(membership.clinicId, range),
    getClinicTreatmentFinanceSummary(membership.clinicId),
    getClinicExpenseReportSummary(membership.clinicId, clinic.timeZone),
  ]);

  const rows: Array<[string, string | number]> = [
    ["Clinic", clinic.name],
    ["Report period", formatReportDateRange(range)],
    ["Timezone", range.timeZone],
    ["Active patients", metrics.activePatients],
    ["Appointments", metrics.appointments],
    ["Pending treatment visits", metrics.pendingTreatmentVisits],
    ["Overdue treatment visits", metrics.overdueTreatmentVisits],
    ["Pending preventive recalls", metrics.pendingPreventiveRecalls],
    ["Overdue preventive recalls", metrics.overduePreventiveRecalls],
    [
      "Manually recorded WhatsApp messages",
      metrics.manuallyRecordedWhatsAppMessages,
    ],
    ["Confirmed follow-ups", metrics.confirmedFollowUps],
    ["Completed treatment plans", metrics.completedTreatmentPlans],
    [
      "Payments collected this month (INR)",
      financialSummary.collectionsThisMonth,
    ],
    ["Outstanding treatment balances (INR)", financialSummary.outstanding],
    ["Clinic expenses this month (INR)", expenseSummary.total],
    ["Expense transactions this month", expenseSummary.transactions],
    ["Collections after recorded expenses (INR; not accounting profit)", financialSummary.collectionsThisMonth - expenseSummary.total],
    ...expenseSummary.byCategory.map((item) => ["Expense category: " + item.category + " (INR)", item.amount] as [string, number]),
  ];

  const csv = [
    ["Metric", "Value"].map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");

  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="dentalflow-clinic-report-${range.endDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
