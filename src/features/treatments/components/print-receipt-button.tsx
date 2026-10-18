"use client";

export function PrintReceiptButton() {
  return (
    <button
      className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print receipt
    </button>
  );
}
