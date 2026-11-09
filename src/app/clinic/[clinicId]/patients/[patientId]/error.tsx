"use client";

export default function PatientProfileError({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <section
        aria-labelledby="patient-profile-error-title"
        className="rounded-xl border border-red-200 bg-white p-6 shadow-sm"
        role="alert"
      >
        <h1
          className="text-xl font-semibold text-slate-900"
          id="patient-profile-error-title"
        >
          Patient profile unavailable
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The profile could not be loaded. Please try again.
        </p>
        <button
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-teal-800 px-4 text-sm font-medium text-white hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
