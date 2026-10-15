"use client";

import { useFormStatus } from "react-dom";

export function MessageSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-md border border-teal-800 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Recording…" : "Record as manually sent"}
    </button>
  );
}
