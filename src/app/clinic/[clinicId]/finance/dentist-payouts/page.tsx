import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createDentistPayout,
  recordDentistPayoutPayment,
} from "@/features/finance/dentist-payout-actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
});

function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const statusMessages: Record<string, string> = {
  created: "Dentist payout statement saved.",
  "payment-recorded": "Payout payment recorded.",
  "period-overlap": "A payout statement already covers part or all of that period for this dentist.",
  "future-period": "Payout periods cannot end in the future.",
  "future-payment": "A payout payment cannot be dated in the future.",
  overpayment: "That payment exceeds the remaining payout balance.",
  "upgrade-required": "Consultant payouts are not included in your current plan.",
  "subscription-restricted": "Your subscription currently restricts finance changes.",
  error: "We couldn't save the payout statement.",
  "payment-error": "We couldn't record that payout payment.",
};

export default async function DentistPayoutsPage({
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

  const [dentists, payouts] = await Promise.all([
    prisma.clinicDentist.findMany({
      where: { clinicId: membership.clinicId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, specialization: true },
    }),
    prisma.dentistPayout.findMany({
      where: { clinicId: membership.clinicId },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true, periodStart: true, periodEnd: true, description: true,
        amount: true, status: true, notes: true,
        dentist: { select: { name: true, specialization: true } },
        payments: {
          orderBy: { paidAt: "asc" },
          select: { amount: true, paidAt: true, paymentMethod: true, reference: true },
        },
      },
    }),
  ]);

  const today = todayInZone(clinic.timeZone);
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeZone: clinic.timeZone,
  });
  const rows = payouts.map((payout) => {
    const paid = payout.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return { ...payout, paid, balance: Math.max(0, Number(payout.amount) - paid) };
  });
  const outstanding = rows.filter((row) => row.balance > 0);
  const totalOutstanding = outstanding.reduce((sum, row) => sum + row.balance, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const canManage = membership.role === "OWNER";
  const message = searchParams?.status ? statusMessages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="finance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Dentist & consultant payouts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Prepare payout statements for a dentist or consultant, then record full or partial payments.
              Amounts are entered by the clinic owner; this does not calculate commissions or run payroll.
            </p>
          </div>
          <Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/cashbook`}>Back to cashbook →</Link>
        </header>

        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Outstanding payouts</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{inr.format(totalOutstanding)}</p>
            <p className="mt-1 text-xs text-slate-500">{outstanding.length} unpaid or partly paid statements</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Payments recorded</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{inr.format(totalPaid)}</p>
            <p className="mt-1 text-xs text-slate-500">Across the latest 100 statements</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Payout statements</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{rows.length.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-xs text-slate-500">Latest 100 clinic statements</p>
          </article>
        </section>

        {canManage ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Create payout statement</h2>
            <p className="mt-1 text-sm text-slate-600">Each dentist can have only one statement covering a given date. Overlapping periods are blocked.</p>
            {dentists.length ? (
              <form action={createDentistPayout} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="clinicId" value={membership.clinicId} />
                <label className="text-sm font-medium text-slate-700">Dentist / consultant
                  <select required name="dentistId" defaultValue="" className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 font-normal">
                    <option value="" disabled>Select provider</option>
                    {dentists.map((dentist) => <option key={dentist.id} value={dentist.id}>{dentist.name}{dentist.specialization ? ` · ${dentist.specialization}` : ""}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Period start
                  <input required type="date" name="periodStart" defaultValue={today.slice(0, 8) + "01"} max={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Period end
                  <input required type="date" name="periodEnd" defaultValue={today} max={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700">Payout amount (₹)
                  <input required type="number" name="amount" min="0.01" max="1000000000" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description
                  <input required name="description" maxLength={240} defaultValue="Professional fees" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes
                  <input name="notes" maxLength={1000} placeholder="Optional calculation or approval notes" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <div className="sm:col-span-2 lg:col-span-4">
                  <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Save payout statement</button>
                </div>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">Add an active dentist or consultant in your clinic team first.</p>
            )}
          </section>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Payout statements are view-only for your current clinic role.</p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Payout register</h2>
            <p className="mt-1 text-sm text-slate-500">Payment totals come from the payout payment ledger. Historical payment records are append-only.</p>
          </div>
          {rows.length ? (
            <div className="divide-y divide-slate-100">
              {rows.map((payout) => (
                <article key={payout.id} className="space-y-3 p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <h3 className="font-semibold text-slate-900">{payout.dentist.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{payout.description}{payout.dentist.specialization ? ` · ${payout.dentist.specialization}` : ""}</p>
                      <p className="mt-1 text-xs text-slate-500">{dateFormatter.format(payout.periodStart)} – {dateFormatter.format(payout.periodEnd)}</p>
                      {payout.notes ? <p className="mt-2 text-xs text-slate-500">{payout.notes}</p> : null}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-slate-900">{inr.format(Number(payout.amount))}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">{payout.balance > 0 ? `${inr.format(payout.balance)} due` : "Paid in full"}</p>
                      <p className="mt-1 text-xs text-slate-500">{inr.format(payout.paid)} paid · {payout.status.replace("_", " ").toLowerCase()}</p>
                    </div>
                  </div>
                  {payout.payments.length ? (
                    <div className="text-xs text-slate-500">
                      {payout.payments.map((payment, index) => (
                        <span key={index}>{index ? " · " : "Payments: "}{inr.format(Number(payment.amount))} ({payment.paymentMethod.replace("_", " ")}) on {dateFormatter.format(payment.paidAt)}{payment.reference ? ` · Ref ${payment.reference}` : ""}</span>
                      ))}
                    </div>
                  ) : null}
                  {canManage && payout.balance > 0 ? (
                    <form action={recordDentistPayoutPayment} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
                      <input type="hidden" name="clinicId" value={membership.clinicId} />
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <label className="text-xs font-medium text-slate-600">Payment (₹)
                        <input required type="number" name="amount" min="0.01" max={payout.balance.toFixed(2)} step="0.01" className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Method
                        <select name="paymentMethod" defaultValue={PaymentMethod.BANK_TRANSFER} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                          {Object.values(PaymentMethod).map((method) => <option key={method} value={method}>{method.replace("_", " ")}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">Paid date
                        <input required type="date" name="paidAt" defaultValue={today} max={today} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" />
                      </label>
                      <label className="text-xs font-medium text-slate-600">Reference
                        <input name="reference" maxLength={120} className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" />
                      </label>
                      <div className="flex items-end"><button type="submit" className="h-9 w-full rounded-md border border-teal-700 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-50">Record payment</button></div>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No dentist payouts recorded yet.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
