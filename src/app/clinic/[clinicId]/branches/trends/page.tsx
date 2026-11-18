import Link from "next/link";
import { AppointmentStatus, ClinicRole, FinancialEntryType } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { getMonthOverMonthChange } from "@/features/clinic-groups/lib/branch-monthly-comparison";
import { buildBranchTrendPeriods } from "@/features/clinic-groups/lib/branch-trends";
import { getClinicReportDateRangeForDates } from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type BranchTrendsPageProps = Readonly<{ params: { clinicId: string } }>;

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type MonthlyMetrics = { payments: number; refunds: number; appointments: number };

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

export default async function BranchTrendsPage({ params }: BranchTrendsPageProps) {
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
  const branchResults = await Promise.all(group.clinics.map(async (clinic) => {
    const periods = anchorPeriods.map((period) => ({
      ...period,
      range: getClinicReportDateRangeForDates(period.range.startDate, period.range.endDate, clinic.timeZone),
    }));
    const monthly = await Promise.all(periods.map(async (period) => {
      const [financialEntries, appointments] = await Promise.all([
        prisma.treatmentFinancialEntry.groupBy({
          by: ["entryType"],
          where: {
            clinicId: clinic.id,
            paidAt: { gte: period.range.startAt, lt: period.range.endExclusiveAt },
            entryType: { in: [FinancialEntryType.PAYMENT, FinancialEntryType.REFUND] },
          },
          _sum: { amount: true },
        }),
        prisma.appointment.count({
          where: {
            clinicId: clinic.id,
            scheduledAt: { gte: period.range.startAt, lt: period.range.endExclusiveAt },
            status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          },
        }),
      ]);
      const payments = safeAmount(financialEntries.find((entry) => entry.entryType === FinancialEntryType.PAYMENT)?._sum.amount);
      const refunds = safeAmount(financialEntries.find((entry) => entry.entryType === FinancialEntryType.REFUND)?._sum.amount);
      return { key: period.key, label: period.label, payments, refunds, appointments: safeCount(appointments), netCollections: payments - refunds };
    }));
    return { id: clinic.id, name: clinic.name, monthly };
  }));

  const groupMonthly = branchResults[0].monthly.map((period, index) => {
    const totals = branchResults.reduce((total, branch) => ({
      payments: total.payments + branch.monthly[index].payments,
      refunds: total.refunds + branch.monthly[index].refunds,
      appointments: total.appointments + branch.monthly[index].appointments,
      netCollections: total.netCollections + branch.monthly[index].netCollections,
    }), { payments: 0, refunds: 0, appointments: 0, netCollections: 0 });
    return { key: period.key, label: period.label, ...totals };
  });
  const maxCollections = Math.max(1, ...groupMonthly.map((period) => Math.max(period.payments, period.refunds, Math.abs(period.netCollections))));
  const total = groupMonthly.reduce((sum, period) => ({
    payments: sum.payments + period.payments,
    refunds: sum.refunds + period.refunds,
    appointments: sum.appointments + period.appointments,
    netCollections: sum.netCollections + period.netCollections,
  }), { payments: 0, refunds: 0, appointments: 0, netCollections: 0 });

  // Compare the two latest completed calendar months; the current month may be partial.
  const latestCompletedIndex = Math.max(0, groupMonthly.length - 2);
  const precedingCompletedIndex = Math.max(0, latestCompletedIndex - 1);
  const latestCompleted = groupMonthly[latestCompletedIndex];
  const precedingCompleted = groupMonthly[precedingCompletedIndex];
  const groupComparisons = [
    { label: "Net collections", value: currency.format(latestCompleted.netCollections), change: getMonthOverMonthChange(latestCompleted.netCollections, precedingCompleted.netCollections), format: (value: number) => currency.format(value) },
    { label: "Payments", value: currency.format(latestCompleted.payments), change: getMonthOverMonthChange(latestCompleted.payments, precedingCompleted.payments), format: (value: number) => currency.format(value) },
    { label: "Refunds", value: currency.format(latestCompleted.refunds), change: getMonthOverMonthChange(latestCompleted.refunds, precedingCompleted.refunds), format: (value: number) => currency.format(value) },
    { label: "Appointments", value: latestCompleted.appointments.toLocaleString("en-IN"), change: getMonthOverMonthChange(latestCompleted.appointments, precedingCompleted.appointments), format: (value: number) => value.toLocaleString("en-IN") },
  ];
  const formatSigned = (value: number, format: (value: number) => string) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;

  return (
    <AppShell clinicId={owner.clinicId} activeSection="branches">
      <div className="mx-auto max-w-6xl space-y-7">
        <div>
          <Link href={`/clinic/${owner.clinicId}/branches/reports`} className="text-sm font-medium text-teal-800 hover:underline">← Branch performance</Link>
          <p className="mt-4 text-sm font-medium text-teal-700">Clinic group · {group.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Financial trends</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Twelve months of group collections and appointment activity, split by branch.</p>
          <a href={`/clinic/${owner.clinicId}/branches/trends/export`} className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800">Download 12-month CSV</a>
        </div>

        <section aria-label="Twelve month group totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Payments recorded", value: currency.format(total.payments) },
            { label: "Refunds recorded", value: currency.format(total.refunds) },
            { label: "Net collections", value: currency.format(total.netCollections) },
            { label: "Appointments", value: total.appointments.toLocaleString("en-IN") },
          ].map((item) => (
            <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-medium text-slate-600">{item.label}</h2>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">Last 12 calendar months</p>
            </article>
          ))}
        </section>

        <section aria-label="Month-over-month comparison" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Month-over-month performance</h2>
            <p className="text-xs text-slate-500">{latestCompleted.label} vs {precedingCompleted.label} · completed months</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {groupComparisons.map((item) => (
              <article key={item.label} className="rounded-lg border border-slate-100 p-4">
                <h3 className="text-sm font-medium text-slate-600">{item.label}</h3>
                <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{item.value}</p>
                <p className="mt-2 text-sm font-medium tabular-nums text-slate-700">
                  {formatSigned(item.change.absoluteChange, item.format)}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {item.change.percentageChange === null ? "· no prior-month baseline" : `· ${item.change.percentageChange > 0 ? "+" : ""}${item.change.percentageChange.toFixed(1)}%`}
                  </span>
                </p>
              </article>
            ))}
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 font-semibold">Branch</th>
                  <th className="px-3 py-2 text-right font-semibold">{latestCompleted.label}</th>
                  <th className="px-3 py-2 text-right font-semibold">{precedingCompleted.label}</th>
                  <th className="py-2 text-right font-semibold">Net change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branchResults.map((branch) => {
                  const latest = branch.monthly[latestCompletedIndex].netCollections;
                  const previous = branch.monthly[precedingCompletedIndex].netCollections;
                  const change = getMonthOverMonthChange(latest, previous);
                  return (
                    <tr key={branch.id}>
                      <th scope="row" className="py-3 font-medium text-slate-800">{branch.name}</th>
                      <td className="px-3 py-3 text-right tabular-nums">{currency.format(latest)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{currency.format(previous)}</td>
                      <td className="py-3 text-right font-semibold tabular-nums">{formatSigned(change.absoluteChange, currency.format)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Percentage change is calculated against the absolute value of the preceding month. When the preceding value is zero, only the absolute change is shown. Increases and decreases are descriptive, not performance ratings.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Monthly group collections</h2>
          <p className="mt-1 text-xs text-slate-500">Bar lengths are scaled to the largest monthly amount in this report.</p>
          <div className="mt-5 space-y-4">
            {groupMonthly.map((period) => (
              <div key={period.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="font-medium text-slate-600">{period.label}</span>
                <div className="space-y-1.5">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`${period.label} payments`}>
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(0, period.payments) / maxCollections * 100}%` }} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${period.label} refunds`}>
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, period.refunds) / maxCollections * 100}%` }} />
                  </div>
                </div>
                <span className="text-right font-semibold tabular-nums text-slate-800">{currency.format(period.netCollections)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-5 border-t border-slate-100 pt-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-teal-600" /> Payments</span>
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-amber-500" /> Refunds</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Monthly branch breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">Amounts are recorded payments less refunds, not accounting profit.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Month</th>
                  {branchResults.map((branch) => <th key={branch.id} colSpan={3} className="px-4 py-3 text-right font-semibold">{branch.name}</th>)}
                  <th className="px-5 py-3 text-right font-semibold">Group net</th>
                </tr>
                <tr>
                  <th className="px-5 py-2 font-medium"> </th>
                  {branchResults.flatMap((branch) => [
                    <th key={`${branch.id}-payments`} className="px-2 py-2 text-right font-medium">Payments</th>,
                    <th key={`${branch.id}-refunds`} className="px-2 py-2 text-right font-medium">Refunds</th>,
                    <th key={`${branch.id}-appointments`} className="px-2 py-2 text-right font-medium">Appts</th>,
                  ])}
                  <th className="px-5 py-2 text-right font-medium">INR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupMonthly.map((period, index) => (
                  <tr key={period.key}>
                    <th scope="row" className="px-5 py-3 font-semibold text-slate-900">{period.label}</th>
                    {branchResults.flatMap((branch) => {
                      const metrics: MonthlyMetrics = branch.monthly[index];
                      return [
                        <td key={`${branch.id}-payments-${period.key}`} className="px-2 py-3 text-right tabular-nums">{currency.format(metrics.payments)}</td>,
                        <td key={`${branch.id}-refunds-${period.key}`} className="px-2 py-3 text-right tabular-nums">{currency.format(metrics.refunds)}</td>,
                        <td key={`${branch.id}-appointments-${period.key}`} className="px-2 py-3 text-right tabular-nums">{metrics.appointments.toLocaleString("en-IN")}</td>,
                      ];
                    })}
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{currency.format(period.netCollections)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Reporting and privacy notes</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">Only clinics where you currently have active owner access are included. Payments and refunds are grouped by recorded paid date; appointments are grouped by scheduled date and exclude cancelled and no-show records. Each branch uses its own timezone. No patient-level or clinical information is read for this report.</p>
        </aside>
      </div>
    </AppShell>
  );
}
