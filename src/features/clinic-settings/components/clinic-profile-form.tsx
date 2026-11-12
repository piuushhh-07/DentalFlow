"use client";

import { useFormState } from "react-dom";

import {
  updateClinicProfile,
  type ClinicProfileState,
} from "@/features/clinic-settings/actions";

const initialState: ClinicProfileState = {};

type Props = {
  clinicId: string;
  clinic: {
    name: string;
    phoneNumber: string | null;
    contactEmail: string | null;
    address: string | null;
    timeZone: string;
  };
};

const timeZones = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

export function ClinicProfileForm({ clinicId, clinic }: Props) {
  const [state, formAction] = useFormState(updateClinicProfile, initialState);

  const inputClass =
    "mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 aria-[invalid=true]:border-red-400";

  return (
    <form action={formAction} className="space-y-6">
      <input name="clinicId" type="hidden" value={clinicId} />
      {state.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800"
        >
          {state.success}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Clinic name *
          <input
            className={inputClass}
            name="name"
            required
            maxLength={160}
            defaultValue={clinic.name}
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          {state.fieldErrors?.name && (
            <span className="mt-1 block text-xs text-red-700">
              {state.fieldErrors.name}
            </span>
          )}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Clinic phone *
          <input
            className={inputClass}
            name="phoneNumber"
            type="tel"
            required
            defaultValue={clinic.phoneNumber ?? ""}
            placeholder="+919876543210"
            aria-invalid={Boolean(state.fieldErrors?.phoneNumber)}
          />
          {state.fieldErrors?.phoneNumber && (
            <span className="mt-1 block text-xs text-red-700">
              {state.fieldErrors.phoneNumber}
            </span>
          )}
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Use +91 followed by your 10-digit mobile number.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Contact email
          <input
            className={inputClass}
            name="contactEmail"
            type="email"
            maxLength={254}
            defaultValue={clinic.contactEmail ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
          />
          {state.fieldErrors?.contactEmail && (
            <span className="mt-1 block text-xs text-red-700">
              {state.fieldErrors.contactEmail}
            </span>
          )}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Timezone *
          <select
            className={inputClass}
            name="timeZone"
            required
            defaultValue={clinic.timeZone}
            aria-invalid={Boolean(state.fieldErrors?.timeZone)}
          >
            {!timeZones.includes(clinic.timeZone) && (
              <option value={clinic.timeZone}>{clinic.timeZone}</option>
            )}
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {state.fieldErrors?.timeZone && (
            <span className="mt-1 block text-xs text-red-700">
              {state.fieldErrors.timeZone}
            </span>
          )}
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Used for appointment times, dates and reminders.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Clinic address
          <textarea
            className="mt-1.5 min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            name="address"
            maxLength={400}
            defaultValue={clinic.address ?? ""}
          />
          {state.fieldErrors?.address && (
            <span className="mt-1 block text-xs text-red-700">
              {state.fieldErrors.address}
            </span>
          )}
        </label>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Only clinic owners can change these details.
        </p>
        <button
          className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          type="submit"
        >
          Save clinic details
        </button>
      </div>
    </form>
  );
}
