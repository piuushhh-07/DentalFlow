import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { PrintPrescriptionButton } from "@/features/prescriptions/components/print-prescription-button";
import { getClinicPrescription } from "@/features/prescriptions/lib/prescription-repository";

type PrescriptionPageProps = Readonly<{
  params: {
    clinicId: string;
    patientId: string;
    prescriptionId: string;
  };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function PrescriptionPage({
  params,
}: PrescriptionPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const prescriptionId = z.string().uuid().safeParse(params.prescriptionId);
  if (!clinicId.success || !patientId.success || !prescriptionId.success) {
    notFound();
  }

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const prescription = await getClinicPrescription(
    membership.clinicId,
    patientId.data,
    prescriptionId.data,
  );
  if (!prescription) notFound();

  const patientUrl = `/clinic/${membership.clinicId}/patients/${patientId.data}`;
  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
            href={`${patientUrl}#prescriptions`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to prescriptions
          </Link>
          <PrintPrescriptionButton />
        </div>

        <article
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9 print:rounded-none print:border-0 print:p-0 print:shadow-none"
          id="prescription-document"
        >
          <header className="border-b-2 border-teal-700 pb-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
                  DentalFlow · Digital prescription
                </p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">
                  {prescription.clinicNameSnapshot}
                </h1>
                {prescription.clinicAddressSnapshot ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {prescription.clinicAddressSnapshot}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-slate-600">
                  {[
                    prescription.clinicPhoneSnapshot,
                    prescription.clinicEmailSnapshot,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-semibold text-slate-900">
                  Prescription date
                </p>
                <p className="mt-1 text-slate-700">
                  {dateFormatter.format(prescription.prescriptionDate)}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Record created{" "}
                  {dateTimeFormatter.format(prescription.createdAt)}
                </p>
              </div>
            </div>
            {prescription.amendsPrescription ? (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 print:bg-white">
                <p className="font-semibold">Correction / amendment</p>
                <p className="mt-1">
                  This prescription amends the earlier record dated{" "}
                  {dateFormatter.format(
                    prescription.amendsPrescription.prescriptionDate,
                  )}
                  . The earlier record remains part of the patient history.
                </p>
                {prescription.amendmentReason ? (
                  <p className="mt-1">Reason: {prescription.amendmentReason}</p>
                ) : null}
              </div>
            ) : null}
          </header>

          <section className="grid gap-4 border-b border-slate-200 py-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Patient
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {prescription.patient.fullName}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prescribing dentist
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {prescription.authorNameSnapshot}
              </p>
              {prescription.authorRegistrationSnapshot ? (
                <p className="mt-1 text-sm text-slate-600">
                  Registration: {prescription.authorRegistrationSnapshot}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                Confirmed by the author ·{" "}
                {dateTimeFormatter.format(prescription.authorConfirmedAt)}
              </p>
            </div>
            {prescription.visit ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Clinical visit
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  Visit {prescription.visit.visitNumber}
                  {prescription.visit.treatmentPlan?.name
                    ? ` · ${prescription.visit.treatmentPlan.name}`
                    : ""}
                </p>
              </div>
            ) : null}
          </section>

          {prescription.diagnosisNotes ? (
            <section className="border-b border-slate-200 py-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Dentist-entered diagnosis / clinical notes
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {prescription.diagnosisNotes}
              </p>
            </section>
          ) : null}

          <section className="py-5">
            <h2 className="text-sm font-semibold text-slate-900">Medicines</h2>
            <div className="mt-3 space-y-3">
              {prescription.medicines.map((medicine, index) => (
                <div
                  className="break-inside-avoid rounded-lg border border-slate-200 p-4 print:rounded-none"
                  key={medicine.id}
                >
                  <p className="font-semibold text-slate-900">
                    {index + 1}. {medicine.medicineName}
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium text-slate-600">
                        Dosage:{" "}
                      </dt>
                      <dd className="inline text-slate-800">
                        {medicine.dosage}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-600">
                        Route:{" "}
                      </dt>
                      <dd className="inline text-slate-800">
                        {medicine.route}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-600">
                        Frequency:{" "}
                      </dt>
                      <dd className="inline text-slate-800">
                        {medicine.frequency}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-600">
                        Duration:{" "}
                      </dt>
                      <dd className="inline text-slate-800">
                        {medicine.duration}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-slate-600">
                        Quantity:{" "}
                      </dt>
                      <dd className="inline text-slate-800">
                        {medicine.quantity}
                      </dd>
                    </div>
                  </dl>
                  {medicine.instructions ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      <span className="font-medium">Instructions: </span>
                      {medicine.instructions}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {prescription.additionalAdvice ? (
            <section className="border-t border-slate-200 py-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Additional advice
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {prescription.additionalAdvice}
              </p>
            </section>
          ) : null}
          {prescription.followUpDate ? (
            <p className="border-t border-slate-200 py-4 text-sm">
              <span className="font-semibold text-slate-900">
                Follow-up date:{" "}
              </span>
              <span className="text-slate-700">
                {dateFormatter.format(prescription.followUpDate)}
              </span>
            </p>
          ) : null}

          <footer className="mt-6 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            This document records information entered and confirmed by the
            prescribing author. It is not generated or medically validated by
            DentalFlow. Please contact the clinic if any detail is unclear.
          </footer>
        </article>

        {prescription.audits.length > 0 ? (
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 print:hidden">
            <h2 className="text-sm font-semibold text-slate-900">
              Prescription audit history
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              {prescription.audits.map((audit) => (
                <li key={audit.id}>
                  {audit.action} ·{" "}
                  {audit.actor.user.displayName ?? "Clinic member"} ·{" "}
                  {dateTimeFormatter.format(audit.createdAt)}
                  {audit.note ? ` · ${audit.note}` : ""}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
