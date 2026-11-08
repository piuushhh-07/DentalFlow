import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { listPatientTreatmentPlans } from "@/features/treatments/lib/treatment-repository";

export const dynamic = "force-dynamic";

type TreatmentPlansPageProps = Readonly<{
  params: { clinicId: string; patientId: string };
}>;

export default async function TreatmentPlansPage({
  params,
}: TreatmentPlansPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);

  if (!clinicId.success || !patientId.success) {
    notFound();
  }

  let membership;
  try {
    membership = await requireClinicPermission(
      clinicId.data,
      ClinicPermission.TREATMENT_PLANS,
    );
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) {
      notFound();
    }
    throw error;
  }

  const plans = await listPatientTreatmentPlans(
    membership.clinicId,
    patientId.data,
  );

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
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-teal-700">Treatment plans</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Care timeline
            </h1>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/new`}
          >
            New plan
          </Link>
        </div>

        {plans.length === 0 ? (
          <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-lg font-semibold text-slate-900">
              No treatment plans yet
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Add the first treatment plan for this patient to begin scheduling
              visits.
            </p>
          </div>
        ) : (
          <div className="mt-7 space-y-4">
            {plans.map((plan) => (
              <Link
                className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md"
                href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${plan.id}`}
                key={plan.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {plan.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {plan.type} · {plan.totalVisits} visits
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {plan.status}
                  </span>
                </div>
                <div className="mt-4 text-sm text-slate-600">
                  {plan.visits.length > 0 ? (
                    <span>
                      Next due:{" "}
                      {plan.visits[0].dueDate.toISOString().slice(0, 10)}
                    </span>
                  ) : (
                    <span>No visits scheduled yet.</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
