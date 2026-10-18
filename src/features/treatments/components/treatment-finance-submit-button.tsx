"use client";

import { useFormStatus } from "react-dom";

export function TreatmentFinanceSubmitButton({
  children,
  pendingLabel,
  secondary = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  secondary?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={
        secondary
          ? "inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          : "inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
      }
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
