"use client";

import {
  OdontogramDentition,
  OdontogramEntryType,
  OdontogramFinding,
  OdontogramSurface,
  OdontogramTreatmentStatus,
} from "@prisma/client";
import { useFormState } from "react-dom";
import { useState } from "react";

import {
  recordOdontogramEntry,
  type OdontogramActionState,
} from "@/features/odontogram/actions";
import {
  permanentToothNumbers,
  primaryToothNumbers,
} from "@/features/odontogram/lib/odontogram-validation";

type OdontogramEntry = Readonly<{
  id: string;
  toothNumber: number;
  dentition: OdontogramDentition;
  entryType: OdontogramEntryType;
  finding: OdontogramFinding | null;
  treatmentName: string | null;
  treatmentStatus: OdontogramTreatmentStatus | null;
  surfaces: OdontogramSurface[];
  notes: string | null;
  supersedesEntryId: string | null;
  createdAt: string;
  supersededBy: { id: string } | null;
  recordedBy: { user: { displayName: string | null } };
  treatmentPlan: { id: string; name: string } | null;
}>;

type OdontogramBoardProps = Readonly<{
  clinicId: string;
  patientId: string;
  entries: OdontogramEntry[];
  treatmentPlans: ReadonlyArray<{ id: string; name: string }>;
}>;

const initialState: OdontogramActionState = {};

const findingLabels: Record<OdontogramFinding, string> = {
  HEALTHY: "Healthy",
  DECAYED: "Decay",
  MISSING: "Missing",
  EXTRACTED: "Extracted",
  RESTORED: "Restored",
  FRACTURED: "Fractured",
  WORN: "Worn",
  IMPACTED: "Impacted",
  SENSITIVE: "Sensitive",
  OTHER: "Other finding",
};

const treatmentStatusLabels: Record<OdontogramTreatmentStatus, string> = {
  EXISTING: "Existing",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

const surfaceLabels: Record<OdontogramSurface, string> = {
  MESIAL: "Mesial",
  DISTAL: "Distal",
  OCCLUSAL: "Occlusal",
  BUCCAL: "Buccal",
  LINGUAL: "Lingual",
  PALATAL: "Palatal",
  INCISAL: "Incisal",
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function getEntrySummary(entry: OdontogramEntry): string {
  if (entry.entryType === OdontogramEntryType.FINDING) {
    return entry.finding ? findingLabels[entry.finding] : "Clinical finding";
  }

  return `${entry.treatmentName || "Treatment"}${
    entry.treatmentStatus
      ? `, ${treatmentStatusLabels[entry.treatmentStatus]}`
      : ""
  }`;
}

function getEntryMarkerClass(entry: OdontogramEntry | undefined): string {
  if (!entry) {
    return "";
  }

  if (entry.entryType === OdontogramEntryType.TREATMENT) {
    switch (entry.treatmentStatus) {
      case OdontogramTreatmentStatus.PLANNED:
        return "bg-amber-500";
      case OdontogramTreatmentStatus.IN_PROGRESS:
        return "bg-blue-600";
      case OdontogramTreatmentStatus.EXISTING:
      case OdontogramTreatmentStatus.COMPLETED:
        return "bg-emerald-600";
      default:
        return "bg-slate-500";
    }
  }

  switch (entry.finding) {
    case OdontogramFinding.DECAYED:
    case OdontogramFinding.FRACTURED:
    case OdontogramFinding.SENSITIVE:
      return "bg-red-600";
    case OdontogramFinding.MISSING:
    case OdontogramFinding.EXTRACTED:
      return "bg-slate-700";
    case OdontogramFinding.HEALTHY:
    case OdontogramFinding.RESTORED:
      return "bg-emerald-600";
    default:
      return "bg-amber-500";
  }
}

export function OdontogramBoard({
  clinicId,
  patientId,
  entries,
  treatmentPlans,
}: OdontogramBoardProps) {
  const [state, formAction] = useFormState(recordOdontogramEntry, initialState);
  const [dentition, setDentition] = useState<OdontogramDentition>(
    OdontogramDentition.PERMANENT,
  );
  const [toothNumber, setToothNumber] = useState<number>(
    permanentToothNumbers[0],
  );
  const [entryType, setEntryType] = useState<OdontogramEntryType>(
    OdontogramEntryType.FINDING,
  );
  const selectedEntries = entries.filter(
    (entry) =>
      entry.dentition === dentition && entry.toothNumber === toothNumber,
  );
  const correctionCandidates = selectedEntries.filter(
    (entry) => !entry.supersededBy && entry.entryType === entryType,
  );
  const teeth =
    dentition === OdontogramDentition.PERMANENT
      ? permanentToothNumbers
      : primaryToothNumbers;
  const quadrants = [
    { label: "Upper right", teeth: teeth.slice(0, teeth.length / 4) },
    {
      label: "Upper left",
      teeth: teeth.slice(teeth.length / 4, teeth.length / 2),
    },
    {
      label: "Lower right",
      teeth: teeth.slice(teeth.length / 2, (teeth.length * 3) / 4),
    },
    { label: "Lower left", teeth: teeth.slice((teeth.length * 3) / 4) },
  ];

  function selectDentition(value: OdontogramDentition) {
    setDentition(value);
    setToothNumber(
      value === OdontogramDentition.PERMANENT
        ? permanentToothNumbers[0]
        : primaryToothNumbers[0],
    );
  }

  return (
    <section
      aria-labelledby="odontogram-title"
      className="odontogram-print-area mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:border-0 print:p-0 print:shadow-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-slate-900"
            id="odontogram-title"
          >
            Interactive odontogram
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Select an FDI tooth to record findings or treatment. Corrections
            create a new attributed entry and preserve the original history.
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50 print:hidden"
          onClick={() => window.print()}
          type="button"
        >
          Print chart
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 print:hidden">
        {Object.values(OdontogramDentition).map((value) => (
          <button
            aria-pressed={dentition === value}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium ${
              dentition === value
                ? "border-teal-700 bg-teal-50 text-teal-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={value}
            onClick={() => selectDentition(value)}
            type="button"
          >
            {value === OdontogramDentition.PERMANENT
              ? "Permanent teeth"
              : "Primary teeth"}
          </button>
        ))}
      </div>

      <div
        aria-label={`${dentition === OdontogramDentition.PERMANENT ? "Permanent" : "Primary"} teeth, FDI numbering`}
        className="mt-5 grid gap-3 sm:grid-cols-2 print:grid-cols-2"
        role="group"
      >
        {quadrants.map((quadrant) => (
          <div
            aria-label={quadrant.label}
            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
            key={quadrant.label}
            role="group"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {quadrant.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quadrant.teeth.map((number) => {
                const currentEntry = entries.find(
                  (entry) =>
                    entry.dentition === dentition &&
                    entry.toothNumber === number &&
                    !entry.supersededBy,
                );
                const entrySummary = currentEntry
                  ? getEntrySummary(currentEntry)
                  : undefined;
                const selected = toothNumber === number;

                return (
                  <button
                    aria-label={`Tooth ${number}${entrySummary ? `, ${entrySummary}` : ""}`}
                    aria-pressed={selected}
                    className={`relative grid size-10 place-items-center rounded-md border text-xs font-semibold ${
                      selected
                        ? "border-teal-700 bg-teal-700 text-white"
                        : currentEntry
                          ? "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-teal-50"
                    }`}
                    key={number}
                    onClick={() => setToothNumber(number)}
                    type="button"
                  >
                    {number}
                    {currentEntry && (
                      <span
                        aria-hidden="true"
                        className={`absolute right-1 top-1 size-1.5 rounded-full ${getEntryMarkerClass(
                          currentEntry,
                        )}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Markers: red indicates decay, fracture, or sensitivity; gray indicates
        missing or extracted; green indicates healthy, restored, or
        existing/completed treatment; amber indicates planned or other findings;
        blue indicates treatment in progress.
      </p>

      <div className="mt-5 grid gap-6 border-t border-slate-100 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Tooth {toothNumber} ·{" "}
            {dentition === OdontogramDentition.PERMANENT
              ? "Permanent"
              : "Primary"}
          </h3>
          {selectedEntries.length ? (
            <ol className="mt-3 space-y-3">
              {selectedEntries.map((entry) => (
                <li
                  className="rounded-lg border border-slate-200 p-3 text-sm"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {entry.entryType === OdontogramEntryType.FINDING
                        ? entry.finding
                          ? findingLabels[entry.finding]
                          : "Finding"
                        : `${entry.treatmentName} · ${
                            entry.treatmentStatus
                              ? treatmentStatusLabels[entry.treatmentStatus]
                              : "Treatment"
                          }`}
                    </p>
                    {entry.supersededBy && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Corrected
                      </span>
                    )}
                  </div>
                  {entry.surfaces.length > 0 && (
                    <p className="mt-1 text-xs text-slate-600">
                      Surfaces:{" "}
                      {entry.surfaces
                        .map((surface) => surfaceLabels[surface])
                        .join(", ")}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                      {entry.notes}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {dateFormatter.format(new Date(entry.createdAt))} ·{" "}
                    {entry.recordedBy.user.displayName || "Clinic team"}
                    {entry.treatmentPlan
                      ? ` · ${entry.treatmentPlan.name}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              No chart history for this tooth yet.
            </p>
          )}
        </div>

        <form action={formAction} className="space-y-4 print:hidden">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="patientId" type="hidden" value={patientId} />
          <input name="toothNumber" type="hidden" value={toothNumber} />
          <input name="dentition" type="hidden" value={dentition} />
          {state.error && (
            <p
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {state.error}
            </p>
          )}
          {state.success && (
            <p
              className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              role="status"
            >
              {state.success}
            </p>
          )}

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="odontogram-entry-type"
            >
              Record type
            </label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="odontogram-entry-type"
              name="entryType"
              onChange={(event) =>
                setEntryType(
                  event.target.value === OdontogramEntryType.TREATMENT
                    ? OdontogramEntryType.TREATMENT
                    : OdontogramEntryType.FINDING,
                )
              }
              value={entryType}
            >
              <option value={OdontogramEntryType.FINDING}>
                Clinical finding
              </option>
              <option value={OdontogramEntryType.TREATMENT}>Treatment</option>
            </select>
          </div>

          {entryType === OdontogramEntryType.FINDING ? (
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="odontogram-finding"
              >
                Finding
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                id="odontogram-finding"
                name="finding"
                required
              >
                <option value="">Select a finding</option>
                {Object.entries(findingLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="odontogram-treatment-name"
                >
                  Treatment
                </label>
                <input
                  className="h-10 w-full rounded-md border border-input px-3 text-sm"
                  id="odontogram-treatment-name"
                  maxLength={160}
                  name="treatmentName"
                  required
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="odontogram-treatment-status"
                >
                  Status
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id="odontogram-treatment-status"
                  name="treatmentStatus"
                  required
                >
                  <option value="">Select status</option>
                  {Object.entries(treatmentStatusLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              Tooth surfaces <span className="font-normal">(optional)</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(surfaceLabels).map(([value, label]) => (
                <label
                  className="inline-flex items-center gap-2 text-xs text-slate-700"
                  key={value}
                >
                  <input
                    className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                    name="surfaces"
                    type="checkbox"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="odontogram-plan"
            >
              Linked treatment plan{" "}
              <span className="font-normal">(optional)</span>
            </label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
              id="odontogram-plan"
              name="treatmentPlanId"
            >
              <option value="">Not linked</option>
              {treatmentPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          {correctionCandidates.length > 0 && (
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="odontogram-correction"
              >
                Correct an existing entry{" "}
                <span className="font-normal">(optional)</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
                id="odontogram-correction"
                name="supersedesEntryId"
              >
                <option value="">Record a new entry</option>
                {correctionCandidates.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.entryType === OdontogramEntryType.FINDING
                      ? entry.finding
                        ? findingLabels[entry.finding]
                        : "Finding"
                      : entry.treatmentName}
                    {" · "}
                    {dateFormatter.format(new Date(entry.createdAt))}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                This adds a correction linked to the selected record; it does
                not overwrite the original.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="odontogram-notes"
            >
              Clinical notes <span className="font-normal">(optional)</span>
            </label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
              id="odontogram-notes"
              maxLength={2000}
              name="notes"
              rows={3}
            />
          </div>

          {state.errors && (
            <p className="text-sm text-red-700" role="alert">
              {Object.values(state.errors).flat().filter(Boolean).join(" ")}
            </p>
          )}
          <button
            className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            type="submit"
          >
            Save chart entry
          </button>
        </form>
      </div>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .odontogram-print-area,
          .odontogram-print-area * {
            visibility: visible;
          }

          .odontogram-print-area {
            position: absolute;
            inset: 0;
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
