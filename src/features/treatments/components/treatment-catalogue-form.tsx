"use client";

import { useFormState } from "react-dom";

import {
  saveTreatmentCatalogueItem,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { TreatmentFinanceSubmitButton } from "@/features/treatments/components/treatment-finance-submit-button";

const initialState: TreatmentActionState = {};

type Props = Readonly<{
  clinicId: string;
  item?: {
    id: string;
    name: string;
    description: string | null;
    defaultPrice: string | null;
  };
}>;

export function TreatmentCatalogueForm({ clinicId, item }: Props) {
  const [state, action] = useFormState(
    saveTreatmentCatalogueItem,
    initialState,
  );

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      {item && <input name="id" type="hidden" value={item.id} />}
      {state.error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Treatment name
        <input
          className="h-11 w-full rounded-md border border-input bg-white px-3"
          defaultValue={item?.name ?? ""}
          maxLength={160}
          name="name"
          required
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Default price (INR)
        <input
          className="h-11 w-full rounded-md border border-input bg-white px-3"
          defaultValue={item?.defaultPrice ?? ""}
          min="0"
          name="defaultPrice"
          pattern="\d{1,10}(\.\d{1,2})?"
          placeholder="Optional"
          step="0.01"
          type="number"
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
        Description
        <textarea
          className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2"
          defaultValue={item?.description ?? ""}
          maxLength={2000}
          name="description"
          rows={2}
        />
      </label>
      {state.errors?.name?.[0] && (
        <p className="text-sm text-red-700 sm:col-span-2">
          {state.errors.name[0]}
        </p>
      )}
      {state.errors?.defaultPrice?.[0] && (
        <p className="text-sm text-red-700 sm:col-span-2">
          {state.errors.defaultPrice[0]}
        </p>
      )}
      <div className="sm:col-span-2">
        <TreatmentFinanceSubmitButton pendingLabel="Saving treatment...">
          {item ? "Save treatment" : "Add treatment"}
        </TreatmentFinanceSubmitButton>
      </div>
    </form>
  );
}
