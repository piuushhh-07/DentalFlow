import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { CancelTreatmentPlanButton } from "@/features/treatments/components/cancel-treatment-plan-button";
import { TreatmentVisitControls } from "@/features/treatments/components/treatment-visit-controls";
import { getClinicTreatmentPlan } from "@/features/treatments/lib/treatment-repository";
import {
  formatClinicDate,
  treatmentPlanStatusLabels,
  treatmentVisitStatusLabels,
} from "@/features/treatments/lib/treatment-validation";

export const dynamic = "force-dynamic";

type TreatmentPlanPageProps = Readonly<{
  params: { clinicId: string; patientId: string; treatmentPlanId: string };
  searchParams: { created?: string; updated?: string; cancelled?: string };
}>;

export default async function TreatmentPlanPage({
  params,
  searchParams,
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

  const plan = await getClinicTreatmentPlan(
    membership.clinicId,
    patientId.data,
    treatmentPlanId.data,
  );

  if (!plan) {
    notFound();
  }

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

        {searchParams.created && (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Treatment plan created successfully.
          </p>
        )}
        {searchParams.updated && (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Treatment plan updated.
          </p>
        )}
        {searchParams.cancelled && (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This plan has been cancelled.
          </p>
        )}

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
              {plan.visits.length} scheduled
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
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {treatmentVisitStatusLabels[visit.status]}
                  </span>
                </div>
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
