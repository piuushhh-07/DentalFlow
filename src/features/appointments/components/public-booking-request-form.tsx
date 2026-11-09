"use client";

import { type FormEvent, useRef, useState } from "react";

import {
  createPublicBookingRequestAction,
  type PublicBookingActionState,
} from "@/features/appointments/actions";

type PublicBookingRequestFormProps = Readonly<{
  slug: string;
  dentists: readonly Readonly<{ id: string; name: string }>[];
  chairs: readonly Readonly<{ id: string; label: string }>[];
}>;

const initialState: PublicBookingActionState = {};
const inputClass =
  "mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

export function PublicBookingRequestForm({
  slug,
  dentists,
  chairs,
}: PublicBookingRequestFormProps) {
  const [state, setState] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isAvailable = dentists.length > 0 && chairs.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const nextState = await createPublicBookingRequestAction(
        state,
        new FormData(event.currentTarget),
      );
      setState(nextState);
    } catch (error) {
      console.error("Public booking request submission failed.", error);
      setState({
        error: "We couldn't send your request. Please try again later.",
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <input name="slug" type="hidden" value={slug} />
      <label className="absolute -left-[10000px] h-px w-px overflow-hidden">
        Website
        <input autoComplete="off" name="website" tabIndex={-1} type="text" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Your name
        <input
          className={inputClass}
          maxLength={160}
          minLength={2}
          name="patientName"
          required
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Indian mobile number
        <input
          autoComplete="tel"
          className={inputClass}
          maxLength={18}
          name="phoneNumber"
          placeholder="+91 98765 43210"
          required
          type="tel"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Preferred date
          <input className={inputClass} name="date" required type="date" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Preferred time (India)
          <input className={inputClass} name="time" required type="time" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Preferred dentist
          <select
            className={inputClass}
            defaultValue=""
            name="dentistId"
            required
          >
            <option disabled value="">
              Choose a dentist
            </option>
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Preferred chair
          <select
            className={inputClass}
            defaultValue=""
            name="chairId"
            required
          >
            <option disabled value="">
              Choose a chair
            </option>
            {chairs.map((chair) => (
              <option key={chair.id} value={chair.id}>
                {chair.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Note for the clinic (optional)
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          maxLength={1000}
          name="notes"
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
        className="h-11 w-full rounded-md bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={!isAvailable || isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Submitting..." : "Request appointment"}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        This is a request only. Your appointment is not confirmed until the
        clinic contacts you.
      </p>
    </form>
  );
}
