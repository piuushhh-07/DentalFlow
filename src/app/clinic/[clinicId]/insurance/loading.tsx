export default function InsuranceLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading insurance workspace"
      className="mx-auto max-w-6xl animate-pulse space-y-6"
    >
      <div className="space-y-3">
        <div className="h-4 w-28 rounded bg-slate-200" />
        <div className="h-9 w-64 rounded bg-slate-200" />
        <div className="h-4 w-full max-w-xl rounded bg-slate-200" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="h-9 w-28 shrink-0 rounded-full bg-slate-200"
            key={index}
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-28 rounded-xl border border-slate-200 bg-white"
            key={index}
          />
        ))}
      </div>
      <span className="sr-only">Loading insurance information…</span>
    </div>
  );
}
