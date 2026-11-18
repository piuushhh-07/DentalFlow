import Link from "next/link";
import { AppointmentStatus, ClinicRole, FinancialEntryType } from "@prisma/client";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, IndianRupee, UsersRound } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { getClinicReportDateRange, formatReportDateRange } from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type BranchReportsPageProps = Readonly<{ params: { clinicId: string } }>;

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

export default async function BranchReportsPage({ params }: BranchReportsPageProps) {
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

  const branches = await Promise.all(group.clinics.map(async (clinic) => {
    const range = getClinicReportDateRange(new Date(), clinic.timeZone);
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
    { label: "Active patients", value: totals.patients.toLocaleString("en-IN"), icon: UsersRound, detail: "Active patient records across branches" },
    { label: "Appointments", value: totals.appointments.toLocaleString("en-IN"), icon: CalendarDays, detail: "Appointments in the reporting window, excluding cancelled and no-show" },
    { label: "Net collections", value: currency.format(totals.netCollections), icon: IndianRupee, detail: `${currency.format(totals.payments)} payments less ${currency.format(totals.refunds)} refunds` },
    { label: "Branches", value: branches.length.toLocaleString("en-IN"), icon: Building2, detail: "Branches where you currently have owner access" },
  ];

  return (
    <AppShell clinicId={owner.clinicId} activeSection="branches">
      <div className="mx-auto max-w-6xl space-y-7">
        <div>
          <Link href={`/clinic/${owner.clinicId}/branches`} className="text-sm font-medium text-teal-800 hover:underline">← Branch management</Link>
          <p className="mt-4 text-sm font-medium text-teal-700">Clinic group · {group.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Branch performance</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">A consolidated operational snapshot for the last 30 calendar days in each branch&apos;s local time zone. Only aggregate counts and amounts are shown; patient-level records remain in their own clinic.</p>
        </div>

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
          <p className="mt-1 text-sm leading-6 text-amber-800">This view includes only aggregate counts and financial totals for clinics where you still have active owner access. It does not expose patient names, contact details, clinical notes, treatment records, invoices or staff-level activity. Each branch&apos;s reports use its own time zone.</p>
        </aside>
      </div>
    </AppShell>
  );
}
