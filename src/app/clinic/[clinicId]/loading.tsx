export default function ClinicDashboardLoading() {
  return (
    <div
      aria-label="Loading follow-up queue"
      aria-live="polite"
      className="mx-auto max-w-6xl animate-pulse"
      role="status"
    >
      <span className="sr-only">Loading follow-up queue…</span>
      <div className="h-8 w-64 rounded bg-slate-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="h-24 rounded-xl bg-white" key={index} />
        ))}
      </div>
      <div className="mt-8 h-7 w-48 rounded bg-slate-200" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="h-36 rounded-xl bg-white" key={index} />
        ))}
      </div>
    </div>
  );
}
