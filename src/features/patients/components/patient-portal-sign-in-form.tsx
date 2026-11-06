"use client";

import { useFormState } from "react-dom";

import {
  requestPatientPortalMagicLink,
  type PatientPortalActionState,
} from "@/features/patients/actions";

const initialState: PatientPortalActionState = {};

export function PatientPortalSignInForm() {
  const [state, formAction] = useFormState(
    requestPatientPortalMagicLink,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Email address
        <input
          autoComplete="email"
          className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
      <button
        className="h-11 w-full rounded-md bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-900"
        type="submit"
      >
        Email me a sign-in link
      </button>
    </form>
  );
}
