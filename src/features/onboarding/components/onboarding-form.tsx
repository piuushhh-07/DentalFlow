"use client";

import { useFormState } from "react-dom";

import {
  createClinic,
  type ClinicOnboardingState,
} from "@/features/onboarding/actions";
import { SubmitButton } from "@/features/onboarding/components/submit-button";

const initialState: ClinicOnboardingState = {};

type FieldProps = Readonly<{
  name: "name" | "phoneNumber" | "timeZone" | "contactEmail" | "address";
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  error?: string;
}>;

function TextField({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
  hint,
  error,
}: FieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700" htmlFor={name}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={Boolean(error)}
        autoComplete={name === "contactEmail" ? "email" : undefined}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
        defaultValue={defaultValue}
        id={name}
        maxLength={name === "name" ? 160 : name === "address" ? 400 : undefined}
        name={name}
        required={required}
        type={type}
      />
      {hint && (
        <p className="text-xs leading-5 text-slate-500" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-red-700" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState(createClinic, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.formError && (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {state.formError}
        </p>
      )}

      <TextField
        error={state.errors?.name?.[0]}
        label="Clinic name"
        name="name"
        required
      />
      <TextField
        error={state.errors?.phoneNumber?.[0]}
        hint="Enter a 10-digit Indian mobile number, with or without +91."
        label="Clinic phone"
        name="phoneNumber"
        required
        type="tel"
      />
      <TextField
        defaultValue="Asia/Kolkata"
        error={state.errors?.timeZone?.[0]}
        hint="Used for visit dates and reminders."
        label="Timezone"
        name="timeZone"
        required
      />
      <TextField
        error={state.errors?.contactEmail?.[0]}
        label="Contact email"
        name="contactEmail"
        type="email"
      />
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="address">
          Clinic address
        </label>
        <textarea
          aria-describedby={state.errors?.address ? "address-error" : undefined}
          aria-invalid={Boolean(state.errors?.address)}
          className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-400"
          id="address"
          maxLength={400}
          name="address"
          rows={3}
        />
        {state.errors?.address?.[0] && (
          <p className="text-xs font-medium text-red-700" id="address-error">
            {state.errors.address[0]}
          </p>
        )}
      </div>

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}
