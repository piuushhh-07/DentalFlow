"use client";

import { useFormState } from "react-dom";

import {
  requestPatientAppointmentCancellation,
  type PatientCancellationActionState,
} from "@/features/appointments/patient-cancellation-actions";

const initialState: PatientCancellationActionState = {};

export function PatientAppointmentCancellationForm({
  appointmentId,
  previousStatus,
}: {
  appointmentId: string;
  previousStatus?: string;
}) {
  const [state, action] = useFormState(
    requestPatientAppointmentCancellation,
    initialState,
  );

  if (previousStatus === "PENDING") {
    return <p className="mt-2 text-xs font-medium text-amber-800">Cancellation request awaiting clinic review</p>;
  }
  if (previousStatus === "APPROVED") {
    return <p className="mt-2 text-xs font-medium text-emerald-800">Appointment cancellation approved</p>;
  }

  return (
    <form action={action} className="mt-3 space-y-2 print:hidden">
      <input name="appointmentId" type="hidden" value={appointmentId} />
      <label className="block text-xs font-medium text-slate-600">
        Reason for cancellation (optional)
        <input
          className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
          maxLength={500}
          name="reason"
          placeholder="Share a short reason"
        />
      </label>
      {state.error && <p className="text-xs text-red-700" role="alert">{state.error}</p>}
      {state.success && <p className="text-xs text-emerald-800" role="status">{state.success}</p>}
      <button
        className="min-h-9 rounded-md border border-rose-300 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50"
        type="submit"
      >
        Request cancellation
      </button>
      <p className="text-xs text-slate-500">Your appointment stays scheduled until the clinic reviews your request.</p>
    </form>
  );
}
