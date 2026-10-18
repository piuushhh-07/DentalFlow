"use client";

import { useFormState } from "react-dom";

import {
  setTreatmentCatalogueStatus,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { TreatmentFinanceSubmitButton } from "@/features/treatments/components/treatment-finance-submit-button";

const initialState: TreatmentActionState = {};

export function TreatmentCatalogueStatusForm({
  clinicId,
  id,
  active,
}: {
  clinicId: string;
  id: string;
  active: boolean;
}) {
  const [state, action] = useFormState(
    setTreatmentCatalogueStatus,
    initialState,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="id" type="hidden" value={id} />
      <input
        name="status"
        type="hidden"
        value={active ? "INACTIVE" : "ACTIVE"}
      />
      {state.error && (
        <span className="text-xs text-red-700">{state.error}</span>
      )}
      <TreatmentFinanceSubmitButton pendingLabel="Saving..." secondary>
        {active ? "Deactivate" : "Activate"}
      </TreatmentFinanceSubmitButton>
    </form>
  );
}
