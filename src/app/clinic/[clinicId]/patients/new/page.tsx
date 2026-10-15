import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { PatientForm } from "@/features/patients/components/patient-form";

type NewPatientPageProps = Readonly<{
  params: { clinicId: string };
}>;

export default async function NewPatientPage({ params }: NewPatientPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);

  if (!clinicId.success) {
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

  const patientsPath = `/clinic/${membership.clinicId}/patients`;

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-2xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={patientsPath}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patients
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Add a patient
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Patient details are visible only to authorized members of this
            clinic.
          </p>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <PatientForm clinicId={membership.clinicId} />
        </section>
      </div>
    </AppShell>
  );
}
