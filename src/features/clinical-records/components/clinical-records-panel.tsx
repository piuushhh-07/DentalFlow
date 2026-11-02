"use client";

import { useFormState } from "react-dom";

import { OdontogramDentition, OdontogramSurface } from "@prisma/client";

import { saveDentalClinicalRecordAction } from "@/features/clinical-records/actions";
import type { DentalClinicalRecord } from "@/features/clinical-records/lib/clinical-record-repository";

type ClinicalRecordsPanelProps = Readonly<{
  clinicId: string;
  patientId: string;
  records: DentalClinicalRecord[];
  visits: Array<{
    id: string;
    visitNumber: number;
    dueDate: string | Date;
    status: string;
    treatmentPlan?: { id: string; name: string } | null;
  }>;
  odontogramEntries: Array<{
    id: string;
    toothNumber: number;
    dentition: string;
    entryType: string;
    finding?: string | null;
  }>;
}>;

const initialState = { success: "", error: "" };

function formatDate(dateLike: string | Date) {
  const value = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export function ClinicalRecordsPanel({
  clinicId,
  patientId,
  records,
  visits,
  odontogramEntries,
}: ClinicalRecordsPanelProps) {
  const [state, formAction] = useFormState(
    saveDentalClinicalRecordAction,
    initialState,
  );

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Clinical records
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Record patient history, findings, diagnosis and recommendations for
            each visit.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-5">
        <input type="hidden" name="clinicId" value={clinicId} />
        <input type="hidden" name="patientId" value={patientId} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-700">
            <span>Visit</span>
            <select
              name="visitId"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              defaultValue=""
            >
              <option value="">General record</option>
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  Visit {visit.visitNumber} ·{" "}
                  {visit.treatmentPlan?.name ?? "Clinical visit"} ·{" "}
                  {formatDate(visit.dueDate)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-700">
            <span>Linked odontogram entry</span>
            <select
              name="relatedOdontogramEntryId"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              defaultValue=""
            >
              <option value="">None</option>
              {odontogramEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.dentition} {entry.toothNumber} · {entry.entryType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Medical history</span>
            <textarea
              name="medicalHistory"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Diabetes, medications, previous procedures, notable conditions"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Dental history</span>
            <textarea
              name="dentalHistory"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Prior treatment, dental anxiety, previous extractions or restorations"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Allergies</span>
            <textarea
              name="allergies"
              rows={2}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Drug, latex or material allergies"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Chief complaints</span>
            <textarea
              name="chiefComplaints"
              rows={3}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Patient-reported complaint and symptom progression"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Clinical examination</span>
            <textarea
              name="clinicalExamination"
              rows={4}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Soft tissue findings, periodontal status, occlusion and clinical observations"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Dentist diagnosis</span>
            <textarea
              name="diagnosis"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Dentist-entered diagnosis, not auto-generated"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Treatment recommendations</span>
            <textarea
              name="treatmentRecommendations"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Recommended sequence of care and treatment planning guidance"
            />
          </label>
          <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
            <span>Clinical notes</span>
            <textarea
              name="clinicalNotes"
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Additional observations, review points or follow-up instructions"
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-800">
            Tooth-specific findings
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span>Tooth number</span>
              <input
                name="toothNumber"
                type="number"
                min={11}
                max={85}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700">
              <span>Dentition</span>
              <select
                name="dentition"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                defaultValue=""
              >
                <option value="">Select</option>
                <option value={OdontogramDentition.PERMANENT}>Permanent</option>
                <option value={OdontogramDentition.PRIMARY}>Primary</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span>Finding label</span>
              <input
                name="toothFindingLabel"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                placeholder="Example: caries, mobility, restoration"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span>Finding summary</span>
              <textarea
                name="toothFindingSummary"
                rows={2}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span>Surfaces</span>
              <div className="flex flex-wrap gap-2">
                {Object.values(OdontogramSurface).map((surface) => (
                  <label
                    key={surface}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="toothSurfaces"
                      value={surface}
                    />
                    {surface}
                  </label>
                ))}
              </div>
            </div>
            <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
              <span>Tooth-specific notes</span>
              <textarea
                name="toothFindingNotes"
                rows={2}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>

        {state.error ? (
          <p className="text-sm font-medium text-red-700">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="text-sm font-medium text-emerald-700">
            {state.success}
          </p>
        ) : null}

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800"
        >
          Save clinical record
        </button>
      </form>

      {records.length ? (
        <div className="mt-6 space-y-4">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {record.createdBy.user.displayName ?? "Dentist"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    }).format(record.createdAt)}
                    {record.visit
                      ? ` · Visit ${record.visit.visitNumber}`
                      : " · General record"}
                  </p>
                </div>
                {record.visit ? (
                  <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800">
                    {record.visit.status}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                {record.chiefComplaints ? (
                  <p>
                    <span className="font-semibold text-slate-900">
                      Chief complaints:
                    </span>{" "}
                    {record.chiefComplaints}
                  </p>
                ) : null}
                {record.clinicalExamination ? (
                  <p>
                    <span className="font-semibold text-slate-900">
                      Clinical examination:
                    </span>{" "}
                    {record.clinicalExamination}
                  </p>
                ) : null}
                {record.diagnosis ? (
                  <p>
                    <span className="font-semibold text-slate-900">
                      Diagnosis:
                    </span>{" "}
                    {record.diagnosis}
                  </p>
                ) : null}
                {record.treatmentRecommendations ? (
                  <p>
                    <span className="font-semibold text-slate-900">
                      Recommendations:
                    </span>{" "}
                    {record.treatmentRecommendations}
                  </p>
                ) : null}
              </div>

              {record.findings.length ? (
                <div className="mt-4 space-y-2">
                  {record.findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600"
                    >
                      <p className="font-medium text-slate-800">
                        {finding.relatedOdontogramEntry
                          ? `${finding.relatedOdontogramEntry.dentition} ${finding.relatedOdontogramEntry.toothNumber}`
                          : finding.dentition && finding.toothNumber
                            ? `${finding.dentition} ${finding.toothNumber}`
                            : "Tooth-specific finding"}
                      </p>
                      {finding.toothFindingLabel ? (
                        <p>{finding.toothFindingLabel}</p>
                      ) : null}
                      {finding.summary ? <p>{finding.summary}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">
          No clinical records yet for this patient.
        </p>
      )}
    </section>
  );
}
