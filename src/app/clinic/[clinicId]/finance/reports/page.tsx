import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { getClinicReceivablesAging } from "@/features/finance/lib/financial-report-repository";
import type { ReceivableAgeBucket } from "@/features/finance/lib/receivables-aging";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeZone: "Asia/Kolkata",
});

const bucketLabels: Record<ReceivableAgeBucket, string> = {
  CURRENT_0_30: "0–30 days",
  DAYS_31_60: "31–60 days",
  DAYS_61_90: "61–90 days",
  OVER_90: "Over 90 days",
};

const bucketOrder: ReceivableAgeBucket[] = [
  "CURRENT_0_30", "DAYS_31_60", "DAYS_61_90", "OVER_90",
];

export default async function FinancialReportsPage({
  params,
}: {
  params: { clinicId: string };
}) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();

  let membership;
  try {
    membership = await requireClinicRole(parsed.data, ["OWNER"]);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, timeZone: true },
  });
  if (!clinic) notFound();

  const report = await getClinicReceivablesAging(
    membership.clinicId,
    clinic.timeZone,
  );
  const today = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeZone: clinic.timeZone,
  }).format(new Date());

  return (
    <AppShell activeSection="finance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <Link href={`/clinic/${membership.clinicId}/finance/cashbook`} className="text-sm font-semibold text-teal-800 hover:underline">← Back to finance</Link>
          <p className="mt-4 text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Financial reports</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Patient receivables ageing, based on outstanding treatment-plan balances. Snapshot as of {today} ({clinic.timeZone}).
          </p>
        </header>

        <nav aria-label="Finance tools" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <Link className="text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/cashbook`}>Daily cashbook →</Link>
          <Link className="text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/payables`}>Vendor payables →</Link>
          <Link className="text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/dentist-payouts`}>Dentist payouts →</Link>
          <Link className="text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/reports`}>Clinic activity reports →</Link>
        </nav>

        <section aria-label="Receivables summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
            <p className="text-sm font-medium text-slate-600">Total receivables</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{inr.format(report.totalOutstandingPaise / 100)}</p>
            <p className="mt-1 text-xs text-slate-500">{report.totalPlans.toLocaleString("en-IN")} open treatment plans</p>
          </article>
          {bucketOrder.map((bucket) => (
            <article key={bucket} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">{bucketLabels[bucket]}</p>
              <p className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{inr.format(report.buckets[bucket].amountPaise / 100)}</p>
              <p className="mt-1 text-xs text-slate-500">{report.buckets[bucket].count.toLocaleString("en-IN")} treatment plans</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Outstanding patient balances</h2>
            <p className="mt-1 text-sm text-slate-500">Oldest open balances first. Discounts, payments and refunds are included in each balance.</p>
          </div>
          {report.items.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      {["Patient", "Treatment plan", "Opened", "Age", "Age band", "Outstanding"].map((label) => (
                        <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.items.slice(0, 250).map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-medium text-slate-900">{item.patientName}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.patientPhone}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{item.treatmentName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dateFormat.format(item.openedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{item.ageDays} days</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{bucketLabels[item.bucket]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{inr.format(item.outstandingPaise / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.items.length > 250 ? (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing the 250 oldest balances of {report.items.length.toLocaleString("en-IN")} open plans. Summary totals include every open plan.</p>
              ) : null}
            </>
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium text-slate-900">No outstanding treatment balances</p>
              <p className="mt-1 text-sm text-slate-500">Open balances will appear here when treatment plans have a remaining amount.</p>
            </div>
          )}
        </section>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Ageing is measured from the treatment plan creation date because the current treatment finance ledger does not store invoice due dates. It is an operational ageing view, not a statutory accounts-receivable ageing report. Cancelled plans and patient credit balances are excluded.
        </p>
      </div>
    </AppShell>
  );
}
