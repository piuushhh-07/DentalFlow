"use client";

import Link from "next/link";
import { TreatmentVisitStatus } from "@prisma/client";
import { useFormState } from "react-dom";

import {
  rescheduleTreatmentVisit,
  updateTreatmentVisitStatus,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { TreatmentVisitStatusSubmitButton } from "@/features/treatments/components/treatment-visit-status-submit-button";
import {
  treatmentVisitStatusLabels,
  toClinicDateInput,
} from "@/features/treatments/lib/treatment-validation";

type TreatmentVisitControlsProps = Readonly<{
  clinicId: string;
  patientId: string;
  treatmentPlanId: string;
  visitId: string;
  status: TreatmentVisitStatus;
  dueDate: Date;
}>;

const initialState: TreatmentActionState = {};

export function TreatmentVisitControls({
  clinicId,
  patientId,
  treatmentPlanId,
  visitId,
  status,
  dueDate,
}: TreatmentVisitControlsProps) {
  const [statusState, statusAction] = useFormState(
    updateTreatmentVisitStatus,
    initialState,
  );
  const [rescheduleState, rescheduleAction] = useFormState(
    rescheduleTreatmentVisit,
    initialState,
  );
  const completed = status === TreatmentVisitStatus.COMPLETED;

  return (
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
      <Link
        className="inline-flex min-h-9 items-center rounded-md border border-teal-700 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 lg:col-span-2"
        href={`/clinic/${clinicId}/patients/${patientId}?clinicalVisitId=${encodeURIComponent(visitId)}#clinical-records`}
      >
        Record clinical notes for this visit
      </Link>
      <form action={statusAction} className="flex flex-col gap-2 sm:flex-row">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="patientId" type="hidden" value={patientId} />
        <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
        <input name="visitId" type="hidden" value={visitId} />
        <label className="sr-only" htmlFor={`status-${visitId}`}>
          Visit status
        </label>
        <select
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-slate-100"
          defaultValue={status}
          disabled={completed}
          id={`status-${visitId}`}
          name="status"
        >
          {Object.entries(treatmentVisitStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {!completed && (
          <TreatmentVisitStatusSubmitButton label="Update status" />
        )}
        {statusState.error && (
          <p className="basis-full text-xs text-red-700" role="alert">
            {statusState.error}
          </p>
        )}
      </form>

      {!completed && (
        <form
          action={rescheduleAction}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="patientId" type="hidden" value={patientId} />
          <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
          <input name="visitId" type="hidden" value={visitId} />
          <label className="sr-only" htmlFor={`date-${visitId}`}>
            Reschedule visit date
          </label>
          <input
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={toClinicDateInput(dueDate)}
            id={`date-${visitId}`}
            name="dueDate"
            required
            type="date"
          />
          <TreatmentVisitStatusSubmitButton label="Reschedule" />
          {rescheduleState.error && (
            <p className="basis-full text-xs text-red-700" role="alert">
              {rescheduleState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
