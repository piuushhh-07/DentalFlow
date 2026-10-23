"use client";

import { AppointmentStatus } from "@prisma/client";
import { useFormState } from "react-dom";

import {
  updateAppointmentStatusAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";

const statuses: readonly AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

export function AppointmentStatusForm({
  clinicId,
  appointmentId,
  status,
}: {
  clinicId: string;
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const [state, action] = useFormState(
    updateAppointmentStatusAction,
    {} as AppointmentActionState,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="appointmentId" type="hidden" value={appointmentId} />
      <label
        className="sr-only"
        htmlFor={`appointment-status-${appointmentId}`}
      >
        Appointment status
      </label>
      <select
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
        defaultValue={status}
        id={`appointment-status-${appointmentId}`}
        name="status"
      >
        {statuses.map((value) => (
          <option key={value} value={value}>
            {value.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <button
        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50"
        type="submit"
      >
        Update
      </button>
      {state.error && (
        <p className="basis-full text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="basis-full text-xs text-emerald-700" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
