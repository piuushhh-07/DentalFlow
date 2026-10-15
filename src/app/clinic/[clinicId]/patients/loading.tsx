export default function PatientsLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading patients"
      className="mx-auto max-w-6xl animate-pulse px-5 py-10 sm:px-8"
    >
      <div className="h-8 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-7 h-11 max-w-xl rounded-md bg-slate-200" />
      <div className="mt-5 h-72 rounded-xl border border-slate-200 bg-white" />
    </main>
  );
}
