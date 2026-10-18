"use client";

export default function InsuranceError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">
        Insurance workspace unavailable
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        We couldn&apos;t load this clinic&apos;s insurance information. Try
        again; if the problem continues, contact your clinic administrator.
      </p>
      <button
        className="mt-5 inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
