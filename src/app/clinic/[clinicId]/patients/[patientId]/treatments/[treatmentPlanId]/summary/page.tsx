import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { PrintSummaryButton } from "@/features/treatments/components/print-summary-button";
import { getTreatmentPlanSummary } from "@/features/treatments/lib/treatment-finance";
import {
  treatmentPlanStatusLabels,
  treatmentTypeLabels,
  treatmentVisitStatusLabels,
} from "@/features/treatments/lib/treatment-validation";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const dateLong = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function TreatmentSummaryPage({
  params,
}: {
  params: { clinicId: string; patientId: string; treatmentPlanId: string };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const planId = z.string().uuid().safeParse(params.treatmentPlanId);
  if (!clinicId.success || !patientId.success || !planId.success) {
    notFound();
  }

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const result = await getTreatmentPlanSummary(
    membership.clinicId,
    patientId.data,
    planId.data,
  );
  if (!result) notFound();
  const { plan, financialSummary } = result;

  const paymentEntries = financialSummary.entries.filter(
    (entry) => entry.entryType === "PAYMENT",
  );

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <Link
            className="text-sm font-medium text-teal-800 hover:underline"
            href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${planId.data}`}
          >
            Back to treatment
          </Link>
          <PrintSummaryButton />
        </div>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          <header className="border-b border-dashed border-slate-300 pb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Treatment summary
            </p>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              {plan.clinic.name}
            </h1>
            {plan.clinic.address && (
              <p className="mt-1 text-sm text-slate-600">
                {plan.clinic.address}
              </p>
            )}
            {plan.clinic.phoneNumber && (
              <p className="mt-1 text-sm text-slate-600">
                Phone: {plan.clinic.phoneNumber}
              </p>
            )}
          </header>

          <dl className="grid gap-x-6 gap-y-5 py-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Patient
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {plan.patient.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Generated
              </dt>
              <dd className="mt-1 text-slate-900">
                {dateTime.format(new Date())}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Treatment
              </dt>
              <dd className="mt-1 text-slate-900">
                {plan.name} · {treatmentTypeLabels[plan.type]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </dt>
              <dd className="mt-1 text-slate-900">
                {treatmentPlanStatusLabels[plan.status]} · {plan.totalVisits}{" "}
                visit{plan.totalVisits === 1 ? "" : "s"} planned
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Started
              </dt>
              <dd className="mt-1 text-slate-900">
                {dateLong.format(plan.createdAt)}
              </dd>
            </div>
            {plan.completedAt && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed
                </dt>
                <dd className="mt-1 text-slate-900">
                  {dateLong.format(plan.completedAt)}
                </dd>
              </div>
            )}
          </dl>

          {plan.notes && (
            <div className="border-t border-slate-200 py-5 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Treatment notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">
                {plan.notes}
              </p>
            </div>
          )}

          <div className="border-t border-slate-200 py-5">
            <h2 className="text-sm font-semibold text-slate-900">Visits</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Due date</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.visits.map((visit) => (
                    <tr key={visit.id}>
                      <td className="py-2 pr-3 text-slate-700">
                        {visit.visitNumber}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {dateLong.format(visit.dueDate)}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {treatmentVisitStatusLabels[visit.status]}
                        {visit.completedAt
                          ? ` (${dateLong.format(visit.completedAt)})`
                          : ""}
                      </td>
                      <td className="py-2 text-slate-600">
                        {visit.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-200 py-5">
            <h2 className="text-sm font-semibold text-slate-900">
              Financial summary
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Estimated cost</span>
                <span>{inr.format(financialSummary.estimate)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Final cost</span>
                <span>{inr.format(financialSummary.final)}</span>
              </div>
              {financialSummary.discount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-600">Discount</span>
                  <span>{inr.format(financialSummary.discount)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-slate-600">Total paid</span>
                <span>{inr.format(financialSummary.payments)}</span>
              </div>
              {financialSummary.refunds > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-600">Refunded</span>
                  <span>{inr.format(financialSummary.refunds)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 font-semibold">
                <span>
                  {financialSummary.patientCredit > 0
                    ? "Patient credit"
                    : "Outstanding balance"}
                </span>
                <span>
                  {inr.format(
                    financialSummary.patientCredit > 0
                      ? financialSummary.patientCredit
                      : financialSummary.outstanding,
                  )}
                </span>
              </div>
            </div>

            {paymentEntries.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Receipt #</th>
                      <th className="py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paymentEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2 pr-3 text-slate-700">
                          {entry.paidAt ? dateLong.format(entry.paidAt) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {entry.receiptNumber ?? "—"}
                        </td>
                        <td className="py-2 text-slate-700">
                          {inr.format(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="pt-6 text-center text-xs text-slate-500">
            Computer-generated treatment summary · DentalFlow
          </p>
        </article>
      </div>
    </AppShell>
  );
}
