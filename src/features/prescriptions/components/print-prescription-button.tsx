"use client";

export function PrintPrescriptionButton() {
  return (
    <button
      className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print / Save as PDF
    </button>
  );
}
