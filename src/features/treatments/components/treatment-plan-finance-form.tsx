"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  updateTreatmentPlanFinancialDetails,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { TreatmentFinanceSubmitButton } from "@/features/treatments/components/treatment-finance-submit-button";
import { treatmentPlanStatusLabels } from "@/features/treatments/lib/treatment-validation";

const initialState: TreatmentActionState = {};

export function TreatmentPlanFinanceForm({
  clinicId,
  patientId,
  treatmentPlanId,
  estimate,
  finalAmount,
  status,
  catalogItems,
  selectedCatalogItemId,
}: {
  clinicId: string;
  patientId: string;
  treatmentPlanId: string;
  estimate: string;
  finalAmount: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  catalogItems: Array<{
    id: string;
    name: string;
    active: boolean;
    defaultPrice: string | null;
  }>;
  selectedCatalogItemId: string;
}) {
  const [state, action] = useFormState(
    updateTreatmentPlanFinancialDetails,
    initialState,
  );
  const [selectedItemId, setSelectedItemId] = useState(selectedCatalogItemId);
  const [estimateValue, setEstimateValue] = useState(estimate);
  const [finalValue, setFinalValue] = useState(finalAmount);

  return (
    <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Estimated price (INR)
        <input
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          onChange={(event) => setEstimateValue(event.target.value)}
          min="0"
          name="estimatedAmount"
          step="0.01"
          type="number"
          value={estimateValue}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Agreed / final price (INR)
        <input
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          onChange={(event) => setFinalValue(event.target.value)}
          min="0"
          name="finalAmount"
          step="0.01"
          type="number"
          value={finalValue}
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Treatment status
        <select
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          defaultValue={status}
          name="status"
        >
          {Object.entries(treatmentPlanStatusLabels).map(([value, label]) => (
            <option disabled={value === "CANCELLED"} key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Catalogue treatment
        <select
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          onChange={(event) => {
            const selected = catalogItems.find(
              (item) => item.id === event.target.value,
            );
            setSelectedItemId(event.target.value);
            if (selected?.defaultPrice) {
              setEstimateValue(selected.defaultPrice);
              setFinalValue(selected.defaultPrice);
            }
          }}
          name="catalogItemId"
          value={selectedItemId}
        >
          <option value="">No catalogue item</option>
          {catalogItems.map((item) => (
            <option disabled={!item.active} key={item.id} value={item.id}>
              {item.name}
              {item.active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
        <span className="block text-xs font-normal text-slate-500">
          Selecting an item with a default price fills the estimate and final
          price; you can edit either value.
        </span>
      </label>
      {state.error && (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-3"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <div className="sm:col-span-3">
        <TreatmentFinanceSubmitButton
          pendingLabel="Saving details..."
          secondary
        >
          Save treatment details
        </TreatmentFinanceSubmitButton>
      </div>
    </form>
  );
}
