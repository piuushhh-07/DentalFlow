"use client";

import { useFormStatus } from "react-dom";

type TreatmentPlanSubmitButtonProps = Readonly<{
  editing: boolean;
}>;

export function TreatmentPlanSubmitButton({
  editing,
}: TreatmentPlanSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending
        ? "Saving…"
        : editing
          ? "Save treatment plan"
          : "Create treatment plan"}
    </button>
  );
}
