"use client";

import { useEffect } from "react";

type ApplicationErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function ApplicationError({
  error,
  reset,
}: ApplicationErrorProps) {
  useEffect(() => {
    console.error("Application route failed", {
      errorName: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-teal-700">DentalFlow</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          This page could not be loaded
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Something went wrong while loading this page. Please try again, or
          contact your clinic administrator if the problem continues.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-slate-500">
            Support reference: {error.digest}
          </p>
        )}
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
