import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { closeCashRegister } from "@/features/finance/actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeZone: "Asia/Kolkata",
});

function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const messages: Record<string, string> = {
  closed: "Day closed. The cash count and reconciliation snapshot have been saved.",
  "already-closed": "A cash register close already exists for that business date. Closed days cannot be overwritten.",
  "future-date": "A future business date cannot be closed.",
  "upgrade-required": "Cash register management is not included in your current plan.",
  "subscription-restricted": "Your clinic subscription currently restricts finance changes.",
  error: "We couldn't close the cash register. Please check the details and try again.",
};

export default async function CashbookPage({
  params, searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { status?: string };
}) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(parsed.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, timeZone: true },
  });
  if (!clinic) notFound();

  const today = todayInZone(clinic.timeZone);
  const closes = await prisma.cashRegisterClose.findMany({
    where: { clinicId: membership.clinicId },
    orderBy: [{ businessDate: "desc" }],
    take: 30,
    select: {
      id: true, businessDate: true, openingCash: true, cashCollections: true,
      cashRefunds: true, cashExpenses: true, expectedCash: true, countedCash: true,
      cashVariance: true, upiCollections: true, cardCollections: true,
      bankTransferCollections: true, otherCollections: true, closedAt: true,
    },
  });
  const canClose = membership.role === "OWNER";
  const status = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="finance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Daily cashbook</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Reconcile the physical cash drawer against recorded patient payments, refunds and cash expenses.
            UPI, card and bank collections are shown separately. This is an operational cash close, not a bank statement reconciliation.
          </p>
        </header>

        <div className="flex flex-wrap gap-5">
          <Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/payables`}>Open vendor payables →</Link>
          <Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/dentist-payouts`}>Dentist & consultant payouts →</Link>
        </div>\n\n        {status ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{status}</p> : null}

        {canClose ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Close a business day</h2>
            <p className="mt-1 text-sm text-slate-600">The system calculates expected cash from the existing treatment ledger and cash expenses. Closing is one-time and cannot be edited.</p>
            <form action={closeCashRegister} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="clinicId" value={membership.clinicId} />
              <label className="text-sm font-medium text-slate-700">Business date
                <input required type="date" name="businessDate" defaultValue={today} max={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Opening cash (₹)
                <input required type="number" name="openingCash" min="0" max="1000000000" step="0.01" defaultValue="0" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Counted cash (₹)
                <input required type="number" name="countedCash" min="0" max="1000000000" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Notes
                <input name="notes" maxLength={1000} placeholder="Optional closing notes" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Save day close</button>
              </div>
            </form>
          </section>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Daily cashbook is view-only for your current clinic role.</p>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Recent day closes</h2>
            <p className="mt-1 text-sm text-slate-600">Saved reconciliation snapshots. Historical closes do not change when new ledger entries are recorded.</p>
          </div>
          {closes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No day closes recorded yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>{["Date","Expected cash","Counted cash","Variance","UPI","Card","Bank transfer"].map((item) => <th key={item} className="whitespace-nowrap px-4 py-3">{item}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {closes.map((close) => (
                    <tr key={close.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{dateFormat.format(close.businessDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{currency.format(Number(close.expectedCash))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{currency.format(Number(close.countedCash))}</td>
                      <td className={`whitespace-nowrap px-4 py-3 font-semibold ${Number(close.cashVariance) === 0 ? "text-emerald-700" : "text-rose-700"}`}>{currency.format(Number(close.cashVariance))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{currency.format(Number(close.upiCollections))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{currency.format(Number(close.cardCollections))}</td>
                      <td className="whitespace-nowrap px-4 py-3">{currency.format(Number(close.bankTransferCollections))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
