"use client";

import { useFormStatus } from "react-dom";

type AppointmentSubmitButtonProps = Readonly<{
  label: string;
}>;

export function AppointmentSubmitButton({
  label,
}: AppointmentSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
