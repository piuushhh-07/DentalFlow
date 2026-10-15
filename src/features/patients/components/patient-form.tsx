"use client";

import { useFormState } from "react-dom";
import Link from "next/link";

import {
  createPatient,
  updatePatient,
  type PatientActionState,
} from "@/features/patients/actions";
import { PatientSubmitButton } from "@/features/patients/components/patient-submit-button";

type PatientFormValues = Readonly<{
  fullName: string;
  phoneNumber: string;
  whatsappOptIn: boolean;
  notes: string;
}>;

type PatientFormProps = Readonly<{
  clinicId: string;
  patientId?: string;
  initialValues?: PatientFormValues;
}>;

const initialState: PatientActionState = {};

export function PatientForm({
  clinicId,
  patientId,
  initialValues,
}: PatientFormProps) {
  const action = patientId ? updatePatient : createPatient;
  const [state, formAction] = useFormState(action, initialState);
  const isEditing = Boolean(patientId);

  return (
    <form action={formAction} className="space-y-5">
      <input name="clinicId" type="hidden" value={clinicId} />
      {patientId && <input name="patientId" type="hidden" value={patientId} />}

      {state.error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="fullName"
        >
          Full name <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={
            state.errors?.fullName ? "fullName-error" : undefined
          }
          aria-invalid={Boolean(state.errors?.fullName)}
          autoComplete="name"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          defaultValue={initialValues?.fullName}
          id="fullName"
          maxLength={160}
          name="fullName"
          required
        />
        {state.errors?.fullName?.[0] && (
          <p className="text-xs font-medium text-red-700" id="fullName-error">
            {state.errors.fullName[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="phoneNumber"
        >
          Indian mobile number <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={
            state.errors?.phoneNumber ? "phoneNumber-error" : "phoneNumber-hint"
          }
          aria-invalid={Boolean(state.errors?.phoneNumber)}
          autoComplete="tel"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          defaultValue={initialValues?.phoneNumber}
          id="phoneNumber"
          maxLength={18}
          name="phoneNumber"
          placeholder="+91 98765 43210"
          required
          type="tel"
        />
        <p className="text-xs leading-5 text-slate-500" id="phoneNumber-hint">
          Enter a 10-digit Indian mobile number. We will store it in +91 format.
        </p>
        {state.errors?.phoneNumber?.[0] && (
          <p
            className="text-xs font-medium text-red-700"
            id="phoneNumber-error"
          >
            {state.errors.phoneNumber[0]}
          </p>
        )}
      </div>

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          WhatsApp follow-up consent
        </legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-slate-700">
          <input
            className="mt-0.5 size-4 shrink-0 accent-teal-700"
            defaultChecked={initialValues?.whatsappOptIn}
            name="whatsappOptIn"
            type="checkbox"
            value="on"
          />
          <span>
            The patient has agreed to receive clinic follow-ups on WhatsApp.
            Only select this after consent has been recorded with the patient.
            Without consent, WhatsApp follow-up actions must remain unavailable.
          </span>
        </label>
      </fieldset>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="notes">
          Notes
        </label>
        <textarea
          aria-describedby={state.errors?.notes ? "notes-error" : undefined}
          aria-invalid={Boolean(state.errors?.notes)}
          className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          defaultValue={initialValues?.notes}
          id="notes"
          maxLength={5000}
          name="notes"
          rows={4}
        />
        {state.errors?.notes?.[0] && (
          <p className="text-xs font-medium text-red-700" id="notes-error">
            {state.errors.notes[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          href={`/clinic/${clinicId}/patients`}
        >
          Cancel
        </Link>
        <PatientSubmitButton editing={isEditing} />
      </div>
    </form>
  );
}
