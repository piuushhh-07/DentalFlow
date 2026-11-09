"use client";

import { useFormState } from "react-dom";

import {
  createAppointmentAction,
  updateAppointmentAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import { AppointmentSubmitButton } from "@/features/appointments/components/appointment-submit-button";

type PatientOption = Readonly<{ id: string; fullName: string }>;
type VisitOption = Readonly<{
  id: string;
  patientId: string;
  visitNumber: number;
  treatmentPlan: { name: string };
}>;
type DentistOption = Readonly<{ id: string; name: string }>;
type ChairOption = Readonly<{ id: string; label: string }>;

type AppointmentFormProps = Readonly<{
  clinicId: string;
  patients: readonly PatientOption[];
  visits: readonly VisitOption[];
  dentists: readonly DentistOption[];
  chairs: readonly ChairOption[];
  datePrefill?: string;
  timePrefill?: string;
  prefill?: Readonly<{
    patientId: string;
    patientName: string;
    treatmentVisitId: string;
    visitLabel: string;
    dueDate: string;
  }>;
  initial?: {
    appointmentId: string;
    patientId: string;
    treatmentVisitId: string | null;
    date: string;
    time: string;
    durationMinutes: number;
    dentistId: string | null;
    chairId: string | null;
    type: string;
    notes: string | null;
  };
}>;

const initialState: AppointmentActionState = {};
const inputClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

export function AppointmentForm({
  clinicId,
  patients,
  visits,
  dentists,
  chairs,
  datePrefill,
  timePrefill,
  prefill,
  initial,
}: AppointmentFormProps) {
  const action = initial ? updateAppointmentAction : createAppointmentAction;
  const [state, formAction] = useFormState(action, initialState);
  const patientNames = new Map(
    patients.map((patient) => [patient.id, patient.fullName]),
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      {initial && (
        <input
          name="appointmentId"
          type="hidden"
          value={initial.appointmentId}
        />
      )}
      {prefill ? (
        <>
          <input name="patientId" type="hidden" value={prefill.patientId} />
          <input
            name="treatmentVisitId"
            type="hidden"
            value={prefill.treatmentVisitId}
          />
          <div className="text-sm font-medium text-slate-700">
            <span>Patient</span>
            <p className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-normal">
              {prefill.patientName}
            </p>
          </div>
          <div className="text-sm font-medium text-slate-700">
            <span>Treatment visit</span>
            <p className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-normal">
              {prefill.visitLabel}
            </p>
          </div>
          <p className="text-sm text-slate-600 sm:col-span-2">
            The visit&apos;s date and status are managed separately from this
            appointment.
          </p>
        </>
      ) : (
        <>
          <label className="text-sm font-medium text-slate-700">
            Patient
            <select
              className={`${inputClass} mt-1`}
              defaultValue={initial?.patientId ?? ""}
              name="patientId"
              required
            >
              <option disabled value="">
                Select patient
              </option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Linked treatment visit (optional)
            <select
              className={`${inputClass} mt-1`}
              defaultValue={initial?.treatmentVisitId ?? ""}
              name="treatmentVisitId"
            >
              <option value="">No linked visit</option>
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {patientNames.get(visit.patientId) ?? "Patient"} ·{" "}
                  {visit.treatmentPlan.name} · Visit {visit.visitNumber}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="text-sm font-medium text-slate-700">
        Date
        <input
          className={`${inputClass} mt-1`}
          defaultValue={prefill?.dueDate ?? datePrefill ?? initial?.date}
          name="date"
          required
          type="date"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Time (Asia/Kolkata)
        <input
          className={`${inputClass} mt-1`}
          defaultValue={initial?.time ?? timePrefill}
          name="time"
          required
          type="time"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Duration (minutes)
        <input
          className={`${inputClass} mt-1`}
          defaultValue={initial?.durationMinutes ?? 30}
          max={480}
          min={5}
          name="durationMinutes"
          required
          type="number"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Dentist
        <select
          className={`${inputClass} mt-1`}
          defaultValue={initial?.dentistId ?? ""}
          name="dentistId"
          required
        >
          <option disabled value="">
            Select dentist
          </option>
          {dentists.map((dentist) => (
            <option key={dentist.id} value={dentist.id}>
              {dentist.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Chair
        <select
          className={`${inputClass} mt-1`}
          defaultValue={initial?.chairId ?? ""}
          name="chairId"
          required
        >
          <option disabled value="">
            Select chair
          </option>
          {chairs.map((chair) => (
            <option key={chair.id} value={chair.id}>
              {chair.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Appointment type
        <input
          className={`${inputClass} mt-1`}
          defaultValue={initial?.type}
          maxLength={160}
          name="type"
          required
        />
      </label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Notes (optional)
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          defaultValue={initial?.notes ?? ""}
          maxLength={5000}
          name="notes"
        />
      </label>
      <div className="sm:col-span-2">
        {state.error && (
          <p className="mb-3 text-sm text-red-700" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="mb-3 text-sm text-emerald-700" role="status">
            {state.success}
          </p>
        )}
        <AppointmentSubmitButton
          label={initial ? "Save appointment" : "Create appointment"}
        />
      </div>
    </form>
  );
}
