"use client";

import { useEffect } from "react";

export default function ClinicReportsError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Clinic report page failed", {
      errorName: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div
      aria-live="assertive"
      className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-white p-6"
      role="alert"
    >
      <h1 className="text-lg font-semibold text-slate-900">
        Reports couldn&apos;t be loaded
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Your clinic data is unchanged. Try loading the report again.
      </p>
      <button
        className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
