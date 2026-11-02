"use client";

import { useFormState } from "react-dom";

import {
  transitionTreatmentEstimateAction,
  type TreatmentEstimateActionState,
} from "@/features/estimates/actions";
import { EstimateSubmitButton } from "@/features/estimates/components/estimate-submit-button";

const initialState: TreatmentEstimateActionState = {};

export function EstimateStatusControl({
  clinicId,
  patientId,
  estimateId,
  options,
}: Readonly<{
  clinicId: string;
  patientId: string;
  estimateId: string;
  options: Array<{ value: string; label: string }>;
}>) {
  const [state, formAction] = useFormState(
    transitionTreatmentEstimateAction,
    initialState,
  );
  if (!options.length) return null;

  return (
    <form action={formAction} className="space-y-3 print:hidden">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      <input name="estimateId" type="hidden" value={estimateId} />
      <label className="block space-y-1 text-sm text-slate-700">
        <span>Update quotation status</span>
        <select
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"
          defaultValue={options[0].value}
          name="status"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm text-slate-700">
        <span>Optional status note</span>
        <input
          className="h-10 w-full rounded-md border border-slate-300 px-3"
          maxLength={1000}
          name="note"
        />
      </label>
      {state.error && (
        <p aria-live="polite" className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          aria-live="polite"
          className="text-sm text-emerald-700"
          role="status"
        >
          {state.success}
        </p>
      )}
      <EstimateSubmitButton pendingLabel="Updating…">
        Record status
      </EstimateSubmitButton>
    </form>
  );
}
