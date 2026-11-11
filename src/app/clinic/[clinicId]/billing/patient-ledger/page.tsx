import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, ReceiptText, Wallet } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  getClinicBillingWorkspace,
  paymentMethodLabels,
} from "@/features/treatments/lib/treatment-finance";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function PatientBillingWorkspacePage({
  params,
}: {
  params: { clinicId: string };
}) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(parsedClinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const [clinic, billing] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true },
    }),
    getClinicBillingWorkspace(membership.clinicId),
  ]);
  if (!clinic) notFound();

  return (
    <AppShell activeSection="billing" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <header>
          <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Patient billing
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Track treatment balances and review payments recorded by your clinic.
            Subscription billing remains under Settings.
          </p>
        </header>

        <section
          aria-label="Billing summary"
          className="mt-7 grid gap-4 sm:grid-cols-2"
        >
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Wallet aria-hidden="true" className="size-4 text-teal-700" />
              Outstanding treatment balance
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              {inr.format(billing.totalOutstanding)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Across {billing.outstandingPlanCount.toLocaleString("en-IN")} treatment plans
              with an amount due.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <CreditCard aria-hidden="true" className="size-4 text-teal-700" />
              Recent payment records
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              {billing.recentPayments.length.toLocaleString("en-IN")}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Latest payment entries across this clinic. Refunds and discounts
              remain part of each treatment ledger.
            </p>
          </article>
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-slate-900">
              Outstanding balances
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Open a treatment plan to review its full ledger or record a payment.
            </p>
          </div>
          {billing.outstandingPlans.length ? (
            <div className="divide-y divide-slate-100">
              {billing.outstandingPlans.map((plan) => (
                <div
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  key={plan.id}
                >
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-slate-900 hover:text-teal-800 hover:underline"
                      href={`/clinic/${membership.clinicId}/patients/${plan.patientId}/treatments/${plan.id}`}
                    >
                      {plan.patientName}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">{plan.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{plan.patientPhone}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-amber-800">
                        {inr.format(plan.outstanding)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Amount due</p>
                    </div>
                    <Link
                      className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      href={`/clinic/${membership.clinicId}/patients/${plan.patientId}/treatments/${plan.id}`}
                    >
                      View ledger
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No outstanding treatment balances. New balances will appear here
              when treatment plans are priced.
            </p>
          )}
          {billing.outstandingPlanCount > billing.outstandingPlans.length && (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Showing the 50 highest outstanding balances.
            </p>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <ReceiptText aria-hidden="true" className="size-4 text-teal-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Recent payments
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Latest 20 payments recorded in treatment ledgers.
            </p>
          </div>
          {billing.recentPayments.length ? (
            <div className="divide-y divide-slate-100">
              {billing.recentPayments.map((payment) => (
                <div
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  key={payment.id}
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {payment.patientName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {payment.treatmentName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {dateTime.format(payment.paidAt)}
                      {payment.paymentMethod
                        ? ` · ${paymentMethodLabels[payment.paymentMethod]}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <p className="font-semibold text-slate-900">
                      {inr.format(payment.amount)}
                    </p>
                    {payment.receiptNumber ? (
                      <Link
                        className="text-sm font-medium text-teal-800 hover:underline"
                        href={`/clinic/${membership.clinicId}/patients/${payment.patientId}/treatments/${payment.treatmentPlanId}/receipts/${payment.id}`}
                      >
                        Receipt {payment.receiptNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">No receipt</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No payments have been recorded yet.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
