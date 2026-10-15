import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { TreatmentPlanForm } from "@/features/treatments/components/treatment-plan-form";
import { getClinicTreatmentPlan } from "@/features/treatments/lib/treatment-repository";

export const dynamic = "force-dynamic";

type EditTreatmentPlanPageProps = Readonly<{
  params: { clinicId: string; patientId: string; treatmentPlanId: string };
}>;

export default async function EditTreatmentPlanPage({
  params,
}: EditTreatmentPlanPageProps) {
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

  const patientPath = `/clinic/${membership.clinicId}/patients/${patientId.data}`;

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`${patientPath}/treatments/${plan.id}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to plan
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Edit treatment plan
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Adjust treatment details while preserving visit sequencing.
          </p>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <TreatmentPlanForm
            clinicId={membership.clinicId}
            existingVisitCount={plan.visits.length}
            initialCustomName={plan.name}
            initialNotes={plan.notes}
            initialTotalVisits={plan.totalVisits}
            initialType={plan.type}
            patientId={patientId.data}
            treatmentPlanId={plan.id}
          />
        </section>
      </div>
    </AppShell>
  );
}
