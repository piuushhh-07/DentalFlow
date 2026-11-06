import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { TreatmentVisitStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { CancelTreatmentPlanButton } from "@/features/treatments/components/cancel-treatment-plan-button";
import { TreatmentVisitControls } from "@/features/treatments/components/treatment-visit-controls";
import { TreatmentPlanFinanceForm } from "@/features/treatments/components/treatment-plan-finance-form";
import { TreatmentFinancialEntryForm } from "@/features/treatments/components/treatment-financial-entry-form";
import { getClinicTreatmentPlan } from "@/features/treatments/lib/treatment-repository";
import {
  getTreatmentPlanFinancialSummary,
  listClinicTreatmentCatalogue,
} from "@/features/treatments/lib/treatment-finance";
import {
  formatClinicDate,
  treatmentPlanStatusLabels,
  treatmentVisitStatusLabels,
  toClinicDateInput,
} from "@/features/treatments/lib/treatment-validation";

export const dynamic = "force-dynamic";

function appointmentClinicDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type TreatmentPlanPageProps = Readonly<{
  params: { clinicId: string; patientId: string; treatmentPlanId: string };
}>;

export default async function TreatmentPlanPage({
  params,
}: TreatmentPlanPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const treatmentPlanId = z.string().uuid().safeParse(params.treatmentPlanId);

  if (!clinicId.success || !patientId.success || !treatmentPlanId.success) {
    notFound();
  }

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  const [plan, summary, catalogueItems] = await Promise.all([
    getClinicTreatmentPlan(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
    ),
    getTreatmentPlanFinancialSummary(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
    ),
    listClinicTreatmentCatalogue(membership.clinicId),
  ]);

  if (!plan) {
    notFound();
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}/patients/${patientId.data}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patient
        </Link>

        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Treatment plan</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {plan.name}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {plan.type} · {treatmentPlanStatusLabels[plan.status]} ·{" "}
              {plan.totalVisits} visits
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              href={`${plan.id}/summary`}
            >
              Download summary
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              href={`${plan.id}/edit`}
            >
              Edit plan
            </Link>
            <CancelTreatmentPlanButton
              clinicId={membership.clinicId}
              patientId={patientId.data}
              treatmentPlanId={plan.id}
            />
          </div>
        </header>

        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-base font-semibold text-slate-900">
            Financial summary
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Estimate
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {currency(summary.estimate)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Final
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {currency(summary.final)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Collected
              </p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">
                {currency(summary.payments)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Outstanding
              </p>
              <p className="mt-2 text-xl font-semibold text-amber-700">
                {currency(summary.outstanding)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Discounts
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {currency(summary.discount)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Refunds
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {currency(summary.refunds)}
              </p>
            </div>
            {summary.patientCredit > 0 && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
                  Patient credit
                </p>
                <p className="mt-2 text-xl font-semibold text-blue-900">
                  {currency(summary.patientCredit)}
                </p>
              </div>
            )}
          </div>
          {plan.status !== "CANCELLED" && (
            <>
              {membership.role === "OWNER" && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Treatment plan charges and status
                  </h3>
                  <TreatmentPlanFinanceForm
                    clinicId={membership.clinicId}
                    estimate={plan.estimatedAmount?.toFixed(2) ?? ""}
                    finalAmount={plan.finalAmount?.toFixed(2) ?? ""}
                    catalogItems={catalogueItems.map((item) => ({
                      id: item.id,
                      name:
                        item.status === "ACTIVE"
                          ? item.name
                          : `${item.name} (inactive)`,
                      active:
                        item.status === "ACTIVE" ||
                        item.id === plan.catalogItemId,
                      defaultPrice: item.defaultPrice?.toFixed(2) ?? null,
                    }))}
                    selectedCatalogItemId={plan.catalogItemId ?? ""}
                    patientId={patientId.data}
                    status={plan.status}
                    treatmentPlanId={plan.id}
                  />
                </div>
              )}
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Record payment, discount or refund
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Payments may be entered by clinic members. Discounts and
                  refunds require an owner account and a reason.
                </p>
                <TreatmentFinancialEntryForm
                  clinicId={membership.clinicId}
                  owner={membership.role === "OWNER"}
                  patientId={patientId.data}
                  requestKey={randomUUID()}
                  today={today}
                  treatmentPlanId={plan.id}
                />
              </div>
            </>
          )}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Financial history
            </h3>
            {summary.entries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No payments, discounts or refunds recorded.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {summary.entries.map((entry) => (
                  <div
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    key={entry.id}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {entry.entryType} · {currency(entry.amount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {entry.paymentMethod ?? "—"} ·{" "}
                        {new Date(entry.paidAt).toLocaleDateString("en-IN", {
                          dateStyle: "medium",
                          timeZone: "Asia/Kolkata",
                        })}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                      </p>
                      {entry.notes && (
                        <p className="mt-1 text-xs text-slate-600">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                    {entry.entryType === "PAYMENT" && (
                      <Link
                        className="text-sm font-medium text-teal-800 hover:underline"
                        href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${plan.id}/receipts/${entry.id}`}
                      >
                        Receipt {entry.receiptNumber ?? ""}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-base font-semibold text-slate-900">
            Plan details
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Patient
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {plan.patient.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {treatmentPlanStatusLabels[plan.status]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total visits
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {plan.totalVisits}
              </dd>
            </div>
          </dl>
          {plan.notes && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Notes
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {plan.notes}
              </p>
            </div>
          )}
        </section>

        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Visits</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              {
                plan.visits.filter((visit) => visit.status === "COMPLETED")
                  .length
              }{" "}
              of {plan.visits.length} completed
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {plan.visits.map((visit) => (
              <div
                className="rounded-lg border border-slate-200 p-4"
                key={visit.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Visit {visit.visitNumber}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Due {formatClinicDate(visit.dueDate)}
                    </p>
                    {visit.completedAt && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Completed {formatClinicDate(visit.completedAt)}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {treatmentVisitStatusLabels[visit.status]}
                  </span>
                </div>
                {visit.appointments[0] ? (
                  <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-slate-700">
                      Appointment{" "}
                      {visit.appointments[0].status.replaceAll("_", " ")} for{" "}
                      {formatClinicDate(visit.appointments[0].scheduledAt)}.
                      Visit status is managed separately.
                    </p>
                    <Link
                      className="mt-1 inline-block font-medium text-teal-800 underline"
                      href={`/clinic/${membership.clinicId}/appointments?date=${appointmentClinicDate(visit.appointments[0].scheduledAt)}`}
                    >
                      View clinic schedule
                    </Link>
                  </div>
                ) : visit.status !== TreatmentVisitStatus.COMPLETED &&
                  visit.status !== TreatmentVisitStatus.CANCELLED ? (
                  <Link
                    className="mt-3 inline-flex min-h-9 items-center rounded-md border border-teal-700 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                    href={`/clinic/${membership.clinicId}/appointments?date=${toClinicDateInput(visit.dueDate)}&patientId=${encodeURIComponent(patientId.data)}&treatmentVisitId=${encodeURIComponent(visit.id)}`}
                  >
                    Schedule appointment
                  </Link>
                ) : null}
                <TreatmentVisitControls
                  clinicId={membership.clinicId}
                  dueDate={visit.dueDate}
                  patientId={patientId.data}
                  status={visit.status}
                  treatmentPlanId={plan.id}
                  visitId={visit.id}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
