"use client";

import { useFormStatus } from "react-dom";

type TreatmentVisitStatusSubmitButtonProps = Readonly<{
  label: string;
}>;

export function TreatmentVisitStatusSubmitButton({
  label,
}: TreatmentVisitStatusSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-input bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
