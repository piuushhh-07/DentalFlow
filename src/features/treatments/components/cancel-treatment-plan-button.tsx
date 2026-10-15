"use client";

import { useFormState } from "react-dom";

import {
  cancelTreatmentPlan,
  type TreatmentActionState,
} from "@/features/treatments/actions";

type CancelTreatmentPlanButtonProps = Readonly<{
  clinicId: string;
  patientId: string;
  treatmentPlanId: string;
}>;

const initialState: TreatmentActionState = {};

export function CancelTreatmentPlanButton({
  clinicId,
  patientId,
  treatmentPlanId,
}: CancelTreatmentPlanButtonProps) {
  const [state, formAction] = useFormState(cancelTreatmentPlan, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Cancel this treatment plan? All unfinished visits will be marked cancelled.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
      <button
        className="inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
        type="submit"
      >
        Cancel plan
      </button>
      {state.error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
