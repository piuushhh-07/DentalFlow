import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { PatientForm } from "@/features/patients/components/patient-form";
import { getClinicPatient } from "@/features/patients/lib/patient-repository";

type EditPatientPageProps = Readonly<{
  params: { clinicId: string; patientId: string };
}>;

export default async function EditPatientPage({
  params,
}: EditPatientPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);

  if (!clinicId.success || !patientId.success) {
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

  const patient = await getClinicPatient(membership.clinicId, patientId.data);

  if (!patient) {
    notFound();
  }

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-2xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}/patients/${patient.id}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patient
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Edit patient
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Update {patient.fullName}&apos;s clinic record.
          </p>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <PatientForm
            clinicId={membership.clinicId}
            initialValues={{
              fullName: patient.fullName,
              phoneNumber: patient.phoneNumber,
              email: patient.email ?? "",
              portalAccessEnabled: patient.portalAccessEnabled,
              whatsappOptIn: patient.whatsappOptIn,
              notes: patient.notes ?? "",
            }}
            patientId={patient.id}
          />
        </section>
      </div>
    </AppShell>
  );
}
