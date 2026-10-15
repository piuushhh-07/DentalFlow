"use client";

import { useFormStatus } from "react-dom";

type RecallControlSubmitButtonProps = Readonly<{ label: string }>;

export function RecallControlSubmitButton({
  label,
}: RecallControlSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
