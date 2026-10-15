"use client";

import { PreventiveRecallStatus } from "@prisma/client";
import { useFormState } from "react-dom";

import {
  rescheduleRecall,
  updateRecallStatus,
  type RecallActionState,
} from "@/features/recalls/actions";
import { RecallControlSubmitButton } from "@/features/recalls/components/recall-control-submit-button";
import { recallStatusLabels } from "@/features/recalls/lib/recall-validation";

type RecallControlsProps = Readonly<{
  clinicId: string;
  recallId: string;
  status: PreventiveRecallStatus;
  dateValue: string;
}>;

const initialState: RecallActionState = {};

export function RecallControls({
  clinicId,
  recallId,
  status,
  dateValue,
}: RecallControlsProps) {
  const [statusState, statusAction] = useFormState(
    updateRecallStatus,
    initialState,
  );
  const [dateState, dateAction] = useFormState(rescheduleRecall, initialState);
  const completed = status === PreventiveRecallStatus.COMPLETED;

  return (
    <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
      <form action={statusAction} className="space-y-2">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="recallId" type="hidden" value={recallId} />
        <label
          className="text-xs font-medium uppercase tracking-wide text-slate-500"
          htmlFor={`recall-status-${recallId}`}
        >
          Recall status
        </label>
        <div className="flex gap-2">
          <select
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={status}
            disabled={completed}
            id={`recall-status-${recallId}`}
            name="status"
          >
            {Object.entries(recallStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {!completed && <RecallControlSubmitButton label="Update" />}
        </div>
        {statusState.error && (
          <p className="text-xs text-red-700" role="alert">
            {statusState.error}
          </p>
        )}
      </form>

      {!completed && status === PreventiveRecallStatus.ACTIVE && (
        <form action={dateAction} className="space-y-2">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="recallId" type="hidden" value={recallId} />
          <label
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
            htmlFor={`recall-date-${recallId}`}
          >
            Reschedule
          </label>
          <div className="flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={dateValue}
              id={`recall-date-${recallId}`}
              name="dueDate"
              required
              type="date"
            />
            <RecallControlSubmitButton label="Save date" />
          </div>
          {dateState.error && (
            <p className="text-xs text-red-700" role="alert">
              {dateState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
