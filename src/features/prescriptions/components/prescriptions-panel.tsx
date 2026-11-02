"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";

import { createDigitalPrescriptionAction } from "@/features/prescriptions/actions";
import type { PrescriptionActionState } from "@/features/prescriptions/actions";
import type { PrescriptionMedicineRow } from "@/features/prescriptions/components/prescription-medicine-rows";
import { PrescriptionMedicineRows } from "@/features/prescriptions/components/prescription-medicine-rows";
import type { PatientDigitalPrescription } from "@/features/prescriptions/lib/prescription-repository";

type VisitOption = Readonly<{
  id: string;
  visitNumber: number;
  dueDate: string | Date;
  treatmentPlan?: { name: string } | null;
}>;

const initialState: PrescriptionActionState = {};

function inputDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function PrescriptionsPanel({
  clinicId,
  patientId,
  patientName,
  prescriptions,
  catalogue,
  visits,
  initialVisitId,
  correctionSource,
  today,
}: Readonly<{
  clinicId: string;
  patientId: string;
  patientName: string;
  prescriptions: PatientDigitalPrescription[];
  catalogue: Array<{
    id: string;
    name: string;
    strength: string | null;
    form: string | null;
  }>;
  visits: VisitOption[];
  initialVisitId?: string;
  correctionSource?: PatientDigitalPrescription;
  today: string;
}>) {
  const [state, formAction] = useFormState(
    createDigitalPrescriptionAction,
    initialState,
  );
  const initialMedicines: PrescriptionMedicineRow[] =
    correctionSource?.medicines.map((medicine) => ({
      catalogueItemId: "",
      medicineName: medicine.medicineName,
      dosage: medicine.dosage,
      route: medicine.route,
      frequency: medicine.frequency,
      duration: medicine.duration,
      quantity: medicine.quantity,
      instructions: medicine.instructions ?? "",
    })) ?? [];
  const [previewMedicines, setPreviewMedicines] = useState<
    PrescriptionMedicineRow[]
  >(() =>
    initialMedicines.length
      ? initialMedicines
      : [
          {
            catalogueItemId: "",
            medicineName: "",
            dosage: "",
            route: "",
            frequency: "",
            duration: "",
            quantity: "",
            instructions: "",
          },
        ],
  );
  const [prescriptionDate, setPrescriptionDate] = useState(today);
  const [diagnosisNotes, setDiagnosisNotes] = useState(
    correctionSource?.diagnosisNotes ?? "",
  );
  const [amendmentReason, setAmendmentReason] = useState("");
  const [additionalAdvice, setAdditionalAdvice] = useState(
    correctionSource?.additionalAdvice ?? "",
  );
  const originalFollowUpDate = inputDate(correctionSource?.followUpDate);
  const [followUpDate, setFollowUpDate] = useState(
    originalFollowUpDate >= today ? originalFollowUpDate : "",
  );
  const [authorRegistrationNumber, setAuthorRegistrationNumber] = useState(
    correctionSource?.authorRegistrationSnapshot ?? "",
  );

  return (
    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      id="prescriptions"
    >
      <header>
        <h2 className="text-base font-semibold text-slate-900">
          Digital prescriptions
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Dentist-entered instructions only. DentalFlow does not generate
          diagnoses or medication recommendations.
        </p>
      </header>

      <form action={formAction} className="mt-5 space-y-5">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="patientId" type="hidden" value={patientId} />
        <input
          name="amendsPrescriptionId"
          type="hidden"
          value={correctionSource?.id ?? ""}
        />
        {correctionSource ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">
              Correcting prescription from{" "}
              {displayDate(correctionSource.prescriptionDate)}
            </p>
            <p className="mt-1">
              The original will remain in history. Enter the reason and review
              every medicine before saving this correction.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-700">
            <span>Prescription date</span>
            <input
              className="h-10 w-full rounded-md border border-slate-300 px-3"
              onChange={(event) =>
                setPrescriptionDate(event.currentTarget.value)
              }
              name="prescriptionDate"
              required
              type="date"
              value={prescriptionDate}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-700">
            <span>Clinical visit (optional)</span>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"
              defaultValue={correctionSource?.visitId ?? initialVisitId ?? ""}
              name="visitId"
            >
              <option value="">Not linked to a visit</option>
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  Visit {visit.visitNumber}
                  {visit.treatmentPlan?.name
                    ? ` · ${visit.treatmentPlan.name}`
                    : ""}
                  {" · "}
                  {displayDate(
                    typeof visit.dueDate === "string"
                      ? new Date(visit.dueDate)
                      : visit.dueDate,
                  )}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
            <span>Dentist-entered diagnosis or clinical notes (optional)</span>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={4000}
              name="diagnosisNotes"
              onChange={(event) => setDiagnosisNotes(event.currentTarget.value)}
              rows={2}
              value={diagnosisNotes}
            />
          </label>
          {correctionSource ? (
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Reason for correction</span>
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                maxLength={1000}
                name="amendmentReason"
                onChange={(event) =>
                  setAmendmentReason(event.currentTarget.value)
                }
                required
                rows={2}
                value={amendmentReason}
              />
            </label>
          ) : null}
        </div>

        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Medicines</h3>
            <p className="mt-1 text-xs text-slate-600">
              Enter and verify the medicine, dosage and instructions yourself.
              Catalogue selection fills only the medicine name and strength.
            </p>
          </div>
          <PrescriptionMedicineRows
            catalogue={catalogue}
            initialMedicines={initialMedicines}
            onChange={setPreviewMedicines}
          />
          {catalogue.length === 0 ? (
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input className="mt-1" name="saveToCatalogue" type="checkbox" />
              Save manually entered medicine names to this clinic’s catalogue
            </label>
          ) : (
            <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
              <input className="mt-1" name="saveToCatalogue" type="checkbox" />
              Add manually entered medicine names to the clinic catalogue
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-700">
            <span>Additional advice (optional)</span>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={4000}
              name="additionalAdvice"
              onChange={(event) =>
                setAdditionalAdvice(event.currentTarget.value)
              }
              rows={3}
              value={additionalAdvice}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-700">
            <span>Follow-up date (optional)</span>
            <input
              className="h-10 w-full rounded-md border border-slate-300 px-3"
              name="followUpDate"
              onChange={(event) => setFollowUpDate(event.currentTarget.value)}
              type="date"
              value={followUpDate}
            />
          </label>
          <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
            <span>Dentist registration details (optional)</span>
            <input
              className="h-10 w-full rounded-md border border-slate-300 px-3"
              maxLength={100}
              name="authorRegistrationNumber"
              onChange={(event) =>
                setAuthorRegistrationNumber(event.currentTarget.value)
              }
              value={authorRegistrationNumber}
            />
            <span className="block text-xs text-slate-500">
              Enter only verified registration details. This value is saved with
              this prescription.
            </span>
          </label>
        </div>

        <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-teal-800">
            Preview prescription
          </summary>
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <header className="border-b border-slate-200 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                DentalFlow · Digital prescription
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {patientName}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Prescription date: {prescriptionDate || "Not set"}
              </p>
              {correctionSource ? (
                <p className="mt-1 text-sm font-medium text-amber-800">
                  Correction · {amendmentReason || "Reason not entered"}
                </p>
              ) : null}
            </header>
            {diagnosisNotes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                <span className="font-semibold">Clinical note: </span>
                {diagnosisNotes}
              </p>
            ) : null}
            <ol className="mt-3 space-y-3">
              {previewMedicines.map((medicine, index) => (
                <li
                  className="rounded border border-slate-100 p-3 text-sm"
                  key={`${index}-${medicine.catalogueItemId}`}
                >
                  <p className="font-semibold text-slate-900">
                    {index + 1}. {medicine.medicineName || "Medicine name"}
                  </p>
                  <p className="mt-1 text-slate-700">
                    Dosage: {medicine.dosage || "—"} · Route:{" "}
                    {medicine.route || "—"}
                  </p>
                  <p className="text-slate-700">
                    Frequency: {medicine.frequency || "—"} · Duration:{" "}
                    {medicine.duration || "—"} · Quantity:{" "}
                    {medicine.quantity || "—"}
                  </p>
                  {medicine.instructions ? (
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">
                      Instructions: {medicine.instructions}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {additionalAdvice ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                <span className="font-semibold">Additional advice: </span>
                {additionalAdvice}
              </p>
            ) : null}
            {followUpDate ? (
              <p className="mt-2 text-sm text-slate-700">
                Follow-up: {followUpDate}
              </p>
            ) : null}
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Draft preview. Review all entries before finalizing.
            </p>
          </div>
        </details>

        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input
            className="mt-1"
            name="authorConfirmed"
            required
            type="checkbox"
          />
          I have reviewed and confirmed every medicine, dosage, route,
          frequency, duration, quantity and instruction in this prescription.
        </label>

        {state.error ? (
          <p aria-live="polite" className="text-sm font-medium text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p
            aria-live="polite"
            className="text-sm font-medium text-emerald-700"
          >
            {state.success}
          </p>
        ) : null}
        <button
          className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          type="submit"
        >
          Save finalized prescription
        </button>
      </form>

      <div className="mt-8 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">
          Patient prescription history
        </h3>
        {prescriptions.length ? (
          <div className="mt-3 space-y-3">
            {prescriptions.map((prescription) => (
              <article
                className="rounded-lg border border-slate-200 p-4"
                key={prescription.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {displayDate(prescription.prescriptionDate)}
                      {prescription.amendsPrescriptionId ? " · Correction" : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {prescription.medicines.length} medicine
                      {prescription.medicines.length === 1 ? "" : "s"} ·{" "}
                      {prescription.authorNameSnapshot} · Created{" "}
                      {displayDate(prescription.createdAt)}
                    </p>
                    {prescription.visit ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Visit {prescription.visit.visitNumber}
                        {prescription.visit.treatmentPlan?.name
                          ? ` · ${prescription.visit.treatmentPlan.name}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm font-medium">
                    <Link
                      className="text-teal-800 underline"
                      href={`/clinic/${clinicId}/patients/${patientId}/prescriptions/${prescription.id}`}
                    >
                      View / print
                    </Link>
                    {prescription.amendments.length === 0 ? (
                      <Link
                        className="text-amber-800 underline"
                        href={`/clinic/${clinicId}/patients/${patientId}?amendsPrescriptionId=${prescription.id}#prescriptions`}
                      >
                        Create correction
                      </Link>
                    ) : null}
                  </div>
                </div>
                {prescription.amendmentReason ? (
                  <p className="mt-2 text-sm text-amber-900">
                    Correction reason: {prescription.amendmentReason}
                  </p>
                ) : null}
                {prescription.medicines.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {prescription.medicines.map((medicine) => (
                      <li key={medicine.id}>
                        {medicine.medicineName} — {medicine.dosage},{" "}
                        {medicine.frequency}, {medicine.duration}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No prescriptions recorded for {patientName}.
          </p>
        )}
      </div>
    </section>
  );
}
