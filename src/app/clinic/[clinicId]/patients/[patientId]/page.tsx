import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, UserRound } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { DeletePatientButton } from "@/features/patients/components/delete-patient-button";
import { getClinicPatient } from "@/features/patients/lib/patient-repository";
import { formatIndianPhoneNumber } from "@/features/patients/lib/patient-validation";

type PatientDetailPageProps = Readonly<{
  params: { clinicId: string; patientId: string };
  searchParams: { created?: string; updated?: string };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function PatientDetailPage({
  params,
  searchParams,
}: PatientDetailPageProps) {
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

  const patientPath = `/clinic/${membership.clinicId}/patients/${patient.id}`;

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}/patients`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patients
        </Link>

        {searchParams.created && (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Patient created successfully.
          </p>
        )}
        {searchParams.updated && (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Patient details updated.
          </p>
        )}

        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800">
              <UserRound aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-teal-700">
                Patient record
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {patient.fullName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {formatIndianPhoneNumber(patient.phoneNumber)}
              </p>
            </div>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href={`${patientPath}/edit`}
          >
            <Pencil aria-hidden="true" className="size-4" />
            Edit patient
          </Link>
        </header>

        <nav
          aria-label="Patient care plans"
          className="mt-6 flex flex-wrap gap-2"
        >
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`${patientPath}/treatments`}
          >
            Treatment plans
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${membership.clinicId}/recalls/new?patientId=${patient.id}`}
          >
            Create preventive recall
          </Link>
        </nav>

        <section
          aria-labelledby="patient-details-title"
          className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            className="text-base font-semibold text-slate-900"
            id="patient-details-title"
          >
            Patient details
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                WhatsApp consent
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {patient.whatsappOptIn ? (
                  <>
                    <span className="font-medium text-emerald-800">
                      Opted in
                    </span>
                    {patient.whatsappOptedInAt && (
                      <span className="mt-1 block text-slate-500">
                        Recorded{" "}
                        {dateFormatter.format(patient.whatsappOptedInAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-medium text-slate-600">
                    Not opted in — WhatsApp follow-up is not allowed
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {dateFormatter.format(patient.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last updated
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {dateFormatter.format(patient.updatedAt)}
              </dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {patient.notes || "No notes added."}
            </p>
          </div>
        </section>

        <section
          aria-labelledby="delete-patient-title"
          className="mt-6 rounded-xl border border-red-200 bg-white p-5 sm:p-6"
        >
          <h2
            className="text-sm font-semibold text-slate-900"
            id="delete-patient-title"
          >
            Delete patient
          </h2>
          <p className="mb-4 mt-1 text-sm leading-5 text-slate-600">
            This also removes treatment plans and recalls. A patient with
            message history cannot be deleted so the audit trail is preserved.
          </p>
          <DeletePatientButton
            clinicId={membership.clinicId}
            patientId={patient.id}
          />
        </section>
      </div>
    </AppShell>
  );
}
