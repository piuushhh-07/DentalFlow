"use client";

import { useMemo, useState } from "react";

type Props = {
  businessDate: string;
  cashCollections: number;
  cashRefunds: number;
  cashClinicExpenses: number;
  cashDentistPayouts: number;
  cashVendorBillPayments: number;
  hasUnclassifiedTreatmentEntry: boolean;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function CashbookLivePreview({
  businessDate,
  cashCollections,
  cashRefunds,
  cashClinicExpenses,
  cashDentistPayouts,
  cashVendorBillPayments,
  hasUnclassifiedTreatmentEntry,
}: Props) {
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");

  const values = useMemo(() => {
    const opening = Number(openingCash);
    const counted = Number(countedCash);
    const validOpening = Number.isFinite(opening) && opening >= 0 ? opening : 0;
    const validCounted = countedCash.trim() !== "" && Number.isFinite(counted) && counted >= 0
      ? counted
      : null;
    const expenses = cashClinicExpenses + cashDentistPayouts + cashVendorBillPayments;
    const expected = validOpening + cashCollections - cashRefunds - expenses;
    return {
      opening: validOpening,
      counted: validCounted,
      expenses,
      expected,
      variance: validCounted === null ? null : validCounted - expected,
    };
  }, [
    openingCash,
    countedCash,
    cashCollections,
    cashRefunds,
    cashClinicExpenses,
    cashDentistPayouts,
    cashVendorBillPayments,
  ]);

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Live reconciliation preview</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Today · {businessDate}</h2>
          <p className="mt-1 text-sm text-slate-600">Updates as you enter opening and counted cash. Nothing is saved by this preview.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-800">Read-only ledger data</span>
      </div>

      {hasUnclassifiedTreatmentEntry ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          A treatment payment or refund has no payment method. The cash impact cannot be safely calculated; review the ledger before closing.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Opening cash (₹)
          <input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Counted cash (₹)
          <input type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="Enter drawer count" className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3" />
        </label>
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs text-slate-500">Expected cash</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{currency.format(values.expected)}</p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-xs text-slate-500">Cash variance</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${values.variance === null ? "text-slate-400" : values.variance === 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {values.variance === null ? "Enter counted cash" : currency.format(values.variance)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Cash collections", cashCollections],
          ["Cash refunds", -cashRefunds],
          ["Clinic cash expenses", -cashClinicExpenses],
          ["Dentist cash payouts", -cashDentistPayouts],
          ["Vendor cash payments", -cashVendorBillPayments],
          ["Total cash outflows", -values.expenses],
        ].map(([label, amount]) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="text-slate-600">{label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{currency.format(Number(amount))}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">UPI, card and bank-transfer collections are excluded from physical cash. This preview is not a bank reconciliation.</p>
    </section>
  );
}
