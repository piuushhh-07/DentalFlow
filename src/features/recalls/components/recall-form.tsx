"use client";

import { PreventiveRecallType } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";

import {
  createRecall,
  updateRecall,
  type RecallActionState,
} from "@/features/recalls/actions";
import { RecallSubmitButton } from "@/features/recalls/components/recall-submit-button";
import { recallTypeLabels } from "@/features/recalls/lib/recall-validation";

type RecallFormProps = Readonly<{
  clinicId: string;
  patientId: string;
  patientName: string;
  recallId?: string;
  initialType?: PreventiveRecallType;
  initialCustomName?: string | null;
  initialIntervalMonths?: number | null;
  initialDueDate?: string;
  initialNotes?: string | null;
}>;

const initialState: RecallActionState = {};

export function RecallForm({
  clinicId,
  patientId,
  patientName,
  recallId,
  initialType = PreventiveRecallType.SIX_MONTH_CHECKUP,
  initialCustomName,
  initialIntervalMonths,
  initialDueDate,
  initialNotes,
}: RecallFormProps) {
  const action = recallId ? updateRecall : createRecall;
  const [state, formAction] = useFormState(action, initialState);
  const [type, setType] = useState(initialType);

  return (
    <form action={formAction} className="space-y-5">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      {recallId && <input name="recallId" type="hidden" value={recallId} />}
      {state.error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="rounded-lg bg-teal-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-800">
          Patient
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {patientName}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="type">
          Recall type
        </label>
        <select
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id="type"
          name="type"
          onChange={(event) =>
            setType(event.target.value as PreventiveRecallType)
          }
          value={type}
        >
          {Object.entries(recallTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {state.errors?.type?.[0] && (
          <p className="text-xs text-red-700">{state.errors.type[0]}</p>
        )}
      </div>

      {type === PreventiveRecallType.CUSTOM && (
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="customName"
          >
            Custom recall name
          </label>
          <input
            aria-invalid={Boolean(state.errors?.customName)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
            defaultValue={initialCustomName ?? ""}
            id="customName"
            maxLength={160}
            name="customName"
            required
          />
          {state.errors?.customName?.[0] && (
            <p className="text-xs text-red-700">{state.errors.customName[0]}</p>
          )}
        </div>
      )}

      {type !== PreventiveRecallType.SIX_MONTH_CHECKUP && (
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="intervalMonths"
          >
            {type === PreventiveRecallType.CUSTOM
              ? "Repeat interval (months)"
              : "Recommended interval (optional)"}
          </label>
          <input
            aria-describedby="interval-hint"
            aria-invalid={Boolean(state.errors?.intervalMonths)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
            defaultValue={initialIntervalMonths ?? ""}
            id="intervalMonths"
            max={120}
            min={1}
            name="intervalMonths"
            required={type === PreventiveRecallType.CUSTOM}
            type="number"
          />
          <p className="text-xs text-slate-500" id="interval-hint">
            Enter a whole number from 1 to 120 months.
          </p>
          {state.errors?.intervalMonths?.[0] && (
            <p className="text-xs text-red-700">
              {state.errors.intervalMonths[0]}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="dueDate">
          Due date
        </label>
        <input
          aria-invalid={Boolean(state.errors?.dueDate)}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          defaultValue={initialDueDate}
          id="dueDate"
          name="dueDate"
          required
          type="date"
        />
        {state.errors?.dueDate?.[0] && (
          <p className="text-xs text-red-700">{state.errors.dueDate[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="notes">
          Notes
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
          <p className="text-xs text-red-700">{state.errors.notes[0]}</p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          href={
            recallId
              ? `/clinic/${clinicId}/recalls/${recallId}`
              : `/clinic/${clinicId}/patients/${patientId}`
          }
        >
          Cancel
        </Link>
        <RecallSubmitButton editing={Boolean(recallId)} />
      </div>
    </form>
  );
}
