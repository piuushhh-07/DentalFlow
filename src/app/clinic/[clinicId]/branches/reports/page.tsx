import Link from "next/link";
import { AppointmentStatus, ClinicRole, FinancialEntryType } from "@prisma/client";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Download, IndianRupee, UsersRound } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { BRANCH_REPORT_PRESETS, resolveBranchReportRange } from "@/features/clinic-groups/lib/branch-reporting";
import { formatReportDateRange } from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type BranchReportsPageProps = Readonly<{
  params: { clinicId: string };
  searchParams?: { range?: string; startDate?: string; endDate?: string };
}>;

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("A branch report count is outside the safe range.");
  }
  return value;
}

function getExportHref(clinicId: string, range: string, startDate: string, endDate: string) {
  const query = new URLSearchParams({ range });
  if (range === "custom") {
    query.set("startDate", startDate);
    query.set("endDate", endDate);
  }
  return `/clinic/${clinicId}/branches/reports/export?${query.toString()}`;
}

export default async function BranchReportsPage({ params, searchParams = {} }: BranchReportsPageProps) {
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
      id: true,
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
  const selectedRange = resolveBranchReportRange(
    now,
    group.clinics.find((clinic) => clinic.id === current.id)!.timeZone,
    searchParams.range,
    searchParams.startDate,
    searchParams.endDate,
  );

  const branches = await Promise.all(group.clinics.map(async (clinic) => {
    const selection = resolveBranchReportRange(
      now,
      clinic.timeZone,
      searchParams.range,
      searchParams.startDate,
      searchParams.endDate,
    );
    const range = selection.range;
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
      id: clinic.id,
      name: clinic.name,
      timeZone: clinic.timeZone,
      rangeLabel: formatReportDateRange(range),
      patients: safeCount(patients),
      appointments: safeCount(appointments),
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

  const cards = [
    { label: "Active patients", value: totals.patients.toLocaleString("en-IN"), icon: UsersRound, detail: "Active patient records across branches (current snapshot)" },
    { label: "Appointments", value: totals.appointments.toLocaleString("en-IN"), icon: CalendarDays, detail: "Appointments in the selected period, excluding cancelled and no-show" },
    { label: "Net collections", value: currency.format(totals.netCollections), icon: IndianRupee, detail: `${currency.format(totals.payments)} payments less ${currency.format(totals.refunds)} refunds` },
    { label: "Branches", value: branches.length.toLocaleString("en-IN"), icon: Building2, detail: "Branches where you currently have owner access" },
  ];

  const presetLabels: Record<(typeof BRANCH_REPORT_PRESETS)[number], string> = {
    "7": "Last 7 days",
    "30": "Last 30 days",
    "90": "Last 90 days",
    month: "This month",
    custom: "Custom dates",
  };
  const exportHref = getExportHref(
    owner.clinicId,
    selectedRange.preset,
    selectedRange.startDateInput,
    selectedRange.endDateInput,
  );

  return (
    <AppShell clinicId={owner.clinicId} activeSection="branches">
      <div className="mx-auto max-w-6xl space-y-7">
        <div>
          <Link href={`/clinic/${owner.clinicId}/branches`} className="text-sm font-medium text-teal-800 hover:underline">← Branch management</Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Clinic group · {group.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Branch performance</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Compare aggregate clinic activity without sharing patient-level records between branches.</p>
            </div>
            <a href={exportHref} download className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800">
              <Download aria-hidden="true" className="size-4" /> Export CSV
            </a>
          </div>
        </div>

        <section aria-label="Report filters" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-xs">
              <label htmlFor="branch-report-range" className="mb-1.5 block text-sm font-medium text-slate-700">Reporting period</label>
              <select id="branch-report-range" name="range" defaultValue={selectedRange.preset} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100">
                {BRANCH_REPORT_PRESETS.map((preset) => <option key={preset} value={preset}>{presetLabels[preset]}</option>)}
              </select>
            </div>
            {selectedRange.preset === "custom" ? (
              <>
                <div>
                  <label htmlFor="branch-report-start" className="mb-1.5 block text-sm font-medium text-slate-700">Start date</label>
                  <input id="branch-report-start" name="startDate" type="date" required value={selectedRange.startDateInput} readOnly className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" />
                </div>
                <div>
                  <label htmlFor="branch-report-end" className="mb-1.5 block text-sm font-medium text-slate-700">End date</label>
                  <input id="branch-report-end" name="endDate" type="date" required value={selectedRange.endDateInput} readOnly className="h-10 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700" />
                </div>
                <p className="text-xs text-slate-500">Select custom dates by editing the URL parameters: startDate and endDate.</p>
              </>
            ) : null}
            <button type="submit" className="h-10 rounded-lg border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50">Apply filters</button>
          </form>
          {selectedRange.error ? <p role="alert" className="mt-3 text-sm text-rose-700">{selectedRange.error} Showing the last 30 days until corrected.</p> : null}
          <p className="mt-3 text-xs text-slate-500">Date boundaries use each branch&apos;s own timezone. Patient totals are a current active-record snapshot; appointment and collection metrics use the selected period.</p>
        </section>

        <section aria-label="Group totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, detail }) => (
            <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-600">{label}</h2>
                <span className="grid size-9 place-items-center rounded-lg bg-teal-50 text-teal-800"><Icon aria-hidden="true" className="size-[18px]" /></span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Branch-wise comparison</h2>
            <p className="mt-1 text-xs text-slate-500">Collections are recorded payments minus recorded refunds, not accounting profit.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Branch</th>
                  <th className="px-4 py-3 text-right font-semibold">Active patients</th>
                  <th className="px-4 py-3 text-right font-semibold">Appointments</th>
                  <th className="px-4 py-3 text-right font-semibold">Payments</th>
                  <th className="px-4 py-3 text-right font-semibold">Refunds</th>
                  <th className="px-5 py-3 text-right font-semibold">Net collections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="px-5 py-4 font-semibold text-slate-900">
                      <Link href={`/clinic/${item.id}`} className="hover:text-teal-800 hover:underline">{item.name}</Link>
                      <span className="mt-1 block text-xs font-normal text-slate-500">{item.rangeLabel} · {item.timeZone}</span>
                    </th>
                    <td className="px-4 py-4 text-right tabular-nums">{item.patients.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{item.appointments.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{currency.format(item.payments)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{currency.format(item.refunds)}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">{currency.format(item.netCollections)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <tr>
                  <th className="px-5 py-4">Group total</th>
                  <td className="px-4 py-4 text-right tabular-nums">{totals.patients.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{totals.appointments.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{currency.format(totals.payments)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{currency.format(totals.refunds)}</td>
                  <td className="px-5 py-4 text-right tabular-nums">{currency.format(totals.netCollections)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Privacy and reporting boundary</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">This view includes only aggregate counts and financial totals for clinics where you still have active owner access. It does not expose patient names, contact details, clinical notes, treatment records, invoices or staff-level activity.</p>
        </aside>
      </div>
    </AppShell>
  );
}
