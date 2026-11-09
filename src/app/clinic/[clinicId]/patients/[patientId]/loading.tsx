export default function PatientProfileLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading patient profile"
      className="mx-auto max-w-6xl animate-pulse px-5 py-10 sm:px-8"
    >
      <div className="h-4 w-36 rounded bg-slate-200" />
      <div className="mt-6 h-9 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-24 rounded-xl border border-slate-200 bg-white"
            key={index}
          />
        ))}
      </div>
      <div className="mt-5 h-44 rounded-xl border border-slate-200 bg-white" />
      <div className="mt-5 h-80 rounded-xl border border-slate-200 bg-white" />
    </main>
  );
}
