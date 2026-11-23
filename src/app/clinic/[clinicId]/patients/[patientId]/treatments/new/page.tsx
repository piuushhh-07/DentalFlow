import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { TreatmentPlanForm } from "@/features/treatments/components/treatment-plan-form";

export const dynamic = "force-dynamic";

type NewTreatmentPlanPageProps = Readonly<{
  params: { clinicId: string; patientId: string };
}>;

export default async function NewTreatmentPlanPage({ params }: NewTreatmentPlanPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);

  if (!clinicId.success || !patientId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to treatment plans
        </Link>
        <div className="mt-5">
          <p className="text-sm font-medium text-teal-700">Treatment plans</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Create treatment plan</h1>
          <p className="mt-2 text-sm text-slate-600">Define the treatment, number of visits and planned visit dates.</p>
        </div>
        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <TreatmentPlanForm clinicId={membership.clinicId} patientId={patientId.data} />
        </section>
      </div>
    </AppShell>
  );
}
