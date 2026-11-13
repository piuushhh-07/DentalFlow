"use client";

import { useFormState } from "react-dom";

import {
  deletePatient,
  type PatientActionState,
} from "@/features/patients/actions";
import { DeleteSubmitButton } from "@/features/patients/components/delete-submit-button";

const initialState: PatientActionState = {};

type DeletePatientButtonProps = Readonly<{
  clinicId: string;
  patientId: string;
}>;

export function DeletePatientButton({
  clinicId,
  patientId,
}: DeletePatientButtonProps) {
  const [state, formAction] = useFormState(deletePatient, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this patient record? This is allowed only when no clinical, appointment, financial, insurance, recall, message, prescription, or export history is linked. Existing patient history is retained.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      {state.error && (
        <p
          aria-live="polite"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <DeleteSubmitButton />
    </form>
  );
}
