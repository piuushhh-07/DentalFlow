"use client";

import { useFormStatus } from "react-dom";

export function EstimateSubmitButton({
  pendingLabel,
  children,
}: Readonly<{
  pendingLabel: string;
  children: string;
}>) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
