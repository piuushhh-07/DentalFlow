import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod, VendorBillStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { recordVendorBillPayment, createVendorBill } from "@/features/finance/payables-actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const statusMessages: Record<string, string> = {
  created: "Vendor bill saved.",
  "payment-recorded": "Payment recorded and outstanding balance updated.",
  overpayment: "That payment exceeds the remaining bill balance.",
  "upgrade-required": "Payables management is not included in your current plan.",
  "subscription-restricted": "Your subscription currently restricts finance changes.",
  error: "We couldn't save the vendor bill.",
  "payment-error": "We couldn't record that payment.",
};

export default async function PayablesPage({
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

  const bills = await prisma.vendorBill.findMany({
    where: { clinicId: membership.clinicId, status: { not: VendorBillStatus.VOID } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, vendorName: true, invoiceNumber: true, description: true,
      category: true, billDate: true, dueDate: true, amount: true, status: true,
      payments: { select: { amount: true, paidAt: true, paymentMethod: true } },
    },
  });
  const today = todayInZone(clinic.timeZone);
  const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: clinic.timeZone });
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const rows = bills.map((bill) => {
    const paid = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = Math.max(0, Number(bill.amount) - paid);
    const daysOverdue = balance > 0 ? Math.max(0, Math.floor((todayDate.getTime() - bill.dueDate.getTime()) / 86400000)) : 0;
    return { ...bill, paid, balance, daysOverdue };
  });
  const openRows = rows.filter((bill) => bill.balance > 0);
  const totalOutstanding = openRows.reduce((sum, bill) => sum + bill.balance, 0);
  const overdue = openRows.filter((bill) => bill.daysOverdue > 0);
  const overdueTotal = overdue.reduce((sum, bill) => sum + bill.balance, 0);
  const canManage = membership.role === "OWNER";
  const message = searchParams?.status ? statusMessages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="finance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Vendor payables</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Record supplier and service-provider bills, due dates and partial payments. This is a manual accounts-payable register, not an invoice or bank integration.
          </p>
        </header>

        <div><Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/dentist-payouts`}>Open dentist & consultant payouts →</Link></div>
        <div><Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/finance/reports`}>Open financial reports →</Link></div>

        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Outstanding payables</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{inr.format(totalOutstanding)}</p>
            <p className="mt-1 text-xs text-slate-500">{openRows.length} unpaid or partly paid bills</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Overdue payables</p>
            <p className="mt-3 text-2xl font-semibold text-rose-700">{inr.format(overdueTotal)}</p>
            <p className="mt-1 text-xs text-slate-500">{overdue.length} bills past their due date</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-600">Recorded bills</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{rows.length.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-xs text-slate-500">Latest 100 non-void bills</p>
          </article>
        </section>

        {canManage ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Record a vendor bill</h2>
            <form action={createVendorBill} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="clinicId" value={membership.clinicId} />
              <label className="text-sm font-medium text-slate-700">Vendor / supplier
                <input required name="vendorName" maxLength={160} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Invoice number
                <input name="invoiceNumber" maxLength={80} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Description
                <input required name="description" maxLength={300} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Category
                <input required name="category" maxLength={80} placeholder="Lab, rent, utilities…" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Bill date
                <input required type="date" name="billDate" defaultValue={today} max={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Due date
                <input required type="date" name="dueDate" defaultValue={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Bill amount (₹)
                <input required type="number" name="amount" min="0.01" max="1000000000" step="0.01" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Notes
                <input name="notes" maxLength={1000} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800" type="submit">Save vendor bill</button>
              </div>
            </form>
          </section>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Vendor payables are view-only for your current clinic role.</p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Bills and payment history</h2>
            <p className="mt-1 text-sm text-slate-500">Payment totals are calculated from the immutable payment ledger.</p>
          </div>
          {rows.length ? (
            <div className="divide-y divide-slate-100">
              {rows.map((bill) => (
                <article key={bill.id} className="space-y-3 p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <h3 className="font-semibold text-slate-900">{bill.vendorName}{bill.invoiceNumber ? ` · ${bill.invoiceNumber}` : ""}</h3>
                      <p className="mt-1 text-sm text-slate-600">{bill.description} · {bill.category}</p>
                      <p className="mt-1 text-xs text-slate-500">Billed {dateFormatter.format(bill.billDate)} · Due {dateFormatter.format(bill.dueDate)}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-slate-900">{inr.format(Number(bill.amount))}</p>
                      <p className={`mt-1 text-sm font-medium ${bill.daysOverdue > 0 ? "text-rose-700" : "text-slate-600"}`}>
                        {bill.balance > 0 ? `${inr.format(bill.balance)} due${bill.daysOverdue > 0 ? ` · ${bill.daysOverdue} days overdue` : ""}` : "Paid in full"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{inr.format(bill.paid)} paid · {bill.status.replace("_", " ").toLowerCase()}</p>
                    </div>
                  </div>
                  {bill.payments.length ? (
                    <div className="text-xs text-slate-500">
                      {bill.payments.map((payment, index) => (
                        <span key={index}>{index ? " · " : "Payments: "}{inr.format(Number(payment.amount))} ({payment.paymentMethod.replace("_", " ")}) on {dateFormatter.format(payment.paidAt)}</span>
                      ))}
                    </div>
                  ) : null}
                  {canManage && bill.balance > 0 ? (
                    <form action={recordVendorBillPayment} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
                      <input type="hidden" name="clinicId" value={membership.clinicId} />
                      <input type="hidden" name="billId" value={bill.id} />
                      <label className="text-xs font-medium text-slate-600">Payment (₹)
                        <input required type="number" name="amount" min="0.01" max={bill.balance.toFixed(2)} step="0.01" className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" />
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
            <p className="px-5 py-10 text-center text-sm text-slate-500">No vendor bills recorded yet.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
