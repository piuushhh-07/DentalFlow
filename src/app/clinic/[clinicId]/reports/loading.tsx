export default function ClinicReportsLoading() {
  return (
    <div aria-label="Loading clinic reports" className="mx-auto max-w-6xl">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-5 w-72 animate-pulse rounded bg-slate-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}
