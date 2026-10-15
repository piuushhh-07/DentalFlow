"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";

import {
  createTreatmentPlan,
  updateTreatmentPlan,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { treatmentTypeLabels } from "@/features/treatments/lib/treatment-validation";
import { TreatmentPlanSubmitButton } from "@/features/treatments/components/treatment-plan-submit-button";

type TreatmentPlanFormProps = Readonly<{
  clinicId: string;
  patientId: string;
  treatmentPlanId?: string;
  initialType?: string;
  initialCustomName?: string;
  initialNotes?: string | null;
  initialTotalVisits?: number;
  existingVisitCount?: number;
}>;

const initialState: TreatmentActionState = {};

export function TreatmentPlanForm({
  clinicId,
  patientId,
  treatmentPlanId,
  initialType = "ROOT_CANAL",
  initialCustomName = "",
  initialNotes,
  initialTotalVisits = 1,
  existingVisitCount = 0,
}: TreatmentPlanFormProps) {
  const action = treatmentPlanId ? updateTreatmentPlan : createTreatmentPlan;
  const [state, formAction] = useFormState(action, initialState);
  const [type, setType] = useState(initialType);
  const [totalVisits, setTotalVisits] = useState(initialTotalVisits);
  const isEditing = Boolean(treatmentPlanId);

  useEffect(() => {
    setTotalVisits((count) => Math.max(existingVisitCount, count));
  }, [existingVisitCount]);

  function changeTotalVisits(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      setTotalVisits(Math.min(30, Math.max(existingVisitCount || 1, parsed)));
    }
  }

  const numberOfDates = isEditing
    ? totalVisits - existingVisitCount
    : totalVisits;

  return (
    <form action={formAction} className="space-y-6">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      {treatmentPlanId && (
        <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
      )}

      {state.error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="treatmentType"
        >
          Treatment type
        </label>
        <select
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="treatmentType"
          name="type"
          onChange={(event) => setType(event.target.value)}
          value={type}
        >
          {Object.entries(treatmentTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {state.errors?.type?.[0] && (
          <p className="text-xs font-medium text-red-700">
            {state.errors.type[0]}
          </p>
        )}
      </div>

      {type === "CUSTOM" && (
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="customName"
          >
            Custom treatment name
          </label>
          <input
            aria-invalid={Boolean(state.errors?.customName)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
            defaultValue={initialCustomName}
            id="customName"
            maxLength={160}
            name="customName"
            required
          />
          {state.errors?.customName?.[0] && (
            <p className="text-xs font-medium text-red-700">
              {state.errors.customName[0]}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="totalVisits"
        >
          Total visits
        </label>
        <input
          aria-describedby="totalVisits-hint"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="totalVisits"
          max={30}
          min={Math.max(existingVisitCount, 1)}
          name="totalVisits"
          onChange={(event) => changeTotalVisits(event.target.value)}
          required
          type="number"
          value={totalVisits}
        />
        <p className="text-xs leading-5 text-slate-500" id="totalVisits-hint">
          {isEditing
            ? "Existing visits are retained. Increase the total to schedule more."
            : "Each visit is created in order and needs a due date."}
        </p>
        {state.errors?.totalVisits?.[0] && (
          <p className="text-xs font-medium text-red-700">
            {state.errors.totalVisits[0]}
          </p>
        )}
      </div>

      {isEditing && existingVisitCount > 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          The {existingVisitCount} existing visit dates are managed on the plan
          page. Use the reschedule controls there to change a scheduled date.
        </p>
      )}

      <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-800">
          {isEditing ? "New visit dates" : "Visit schedule"}
        </legend>
        {numberOfDates === 0 ? (
          <p className="text-sm text-slate-600">
            No additional visits to schedule.
          </p>
        ) : (
          Array.from({ length: numberOfDates }, (_, index) => {
            const visitNumber = isEditing
              ? existingVisitCount + index + 1
              : index + 1;
            return (
              <div className="space-y-2" key={visitNumber}>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor={`dueDate-${visitNumber}`}
                >
                  Visit {visitNumber} due date
                </label>
                <input
                  aria-label={`Visit ${visitNumber} due date`}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id={`dueDate-${visitNumber}`}
                  name={isEditing ? "additionalDueDate" : "dueDate"}
                  required
                  type="date"
                />
              </div>
            );
          })
        )}
        {state.errors?.dueDates?.[0] && (
          <p className="text-xs font-medium text-red-700">
            {state.errors.dueDates[0]}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="notes">
          Plan notes
        </label>
        <textarea
          aria-invalid={Boolean(state.errors?.notes)}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          defaultValue={initialNotes ?? ""}
          id="notes"
          maxLength={5000}
          name="notes"
          rows={3}
        />
        {state.errors?.notes?.[0] && (
          <p className="text-xs font-medium text-red-700">
            {state.errors.notes[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          href={`/clinic/${clinicId}/patients/${patientId}`}
        >
          Cancel
        </Link>
        <TreatmentPlanSubmitButton editing={isEditing} />
      </div>
    </form>
  );
}
