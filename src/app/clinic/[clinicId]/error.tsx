"use client";

import { useEffect } from "react";

type ClinicDashboardErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function ClinicDashboardError({
  error,
  reset,
}: ClinicDashboardErrorProps) {
  useEffect(() => {
    console.error("Clinic page failed", {
      errorName: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-semibold text-slate-900">
        Clinic page could not be loaded
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This clinic page is temporarily unavailable. Your records have not been
        changed. Please retry, or contact support if the problem continues.
      </p>
      {error.digest && (
        <p className="mt-3 text-xs text-slate-500">Reference: {error.digest}</p>
      )}
      <button
        className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
