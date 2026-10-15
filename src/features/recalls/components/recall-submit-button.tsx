"use client";

import { useFormStatus } from "react-dom";

type RecallSubmitButtonProps = Readonly<{ editing: boolean }>;

export function RecallSubmitButton({ editing }: RecallSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : editing ? "Save recall" : "Create recall"}
    </button>
  );
}
