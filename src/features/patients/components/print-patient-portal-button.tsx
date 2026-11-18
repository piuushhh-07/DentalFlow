"use client";

export function PrintPatientPortalButton() {
  return (
    <button
      className="inline-flex min-h-10 items-center rounded-md border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print / Save as PDF
    </button>
  );
}
