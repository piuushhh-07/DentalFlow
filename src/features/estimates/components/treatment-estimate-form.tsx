"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormState } from "react-dom";

import {
  createTreatmentEstimateAction,
  type TreatmentEstimateActionState,
} from "@/features/estimates/actions";
import {
  EstimateProcedureRows,
  type EstimateCatalogueItem,
  type EstimateProcedureRow,
} from "@/features/estimates/components/estimate-procedure-rows";
import { EstimateSubmitButton } from "@/features/estimates/components/estimate-submit-button";
import { calculateTreatmentEstimateTotals } from "@/features/estimates/lib/estimate-calculations";

const initialState: TreatmentEstimateActionState = {};

function currency(amount: string | number) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function TreatmentEstimateForm({
  clinicId,
  patientId,
  patientName,
  treatmentPlanId,
  treatmentPlanName,
  catalogue,
  today,
  revisionSource,
}: Readonly<{
  clinicId: string;
  patientId: string;
  patientName: string;
  treatmentPlanId: string;
  treatmentPlanName: string;
  catalogue: EstimateCatalogueItem[];
  today: string;
  revisionSource?: {
    id: string;
    version: number;
    revisionReason: string | null;
    estimateDate: Date;
    validityDate: Date;
    discountAmount: string;
    taxRate: string;
    dentistRegistrationSnapshot: string | null;
    notes: string | null;
    terms: string | null;
    lines: Array<{
      catalogueItemId: string | null;
      description: string;
      quantity: number;
      unitPrice: string;
    }>;
  };
}>) {
  const [state, formAction] = useFormState(
    createTreatmentEstimateAction,
    initialState,
  );
  const initialRows: EstimateProcedureRow[] =
    revisionSource?.lines.map((line) => ({
      catalogueItemId: line.catalogueItemId ?? "",
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: line.unitPrice,
    })) ?? [];
  const [rows, setRows] = useState(initialRows);
  const [discountAmount, setDiscountAmount] = useState(
    revisionSource?.discountAmount ?? "0.00",
  );
  const [taxRate, setTaxRate] = useState(revisionSource?.taxRate ?? "0");
  const [validityDate, setValidityDate] = useState(
    revisionSource
      ? revisionSource.validityDate.toISOString().slice(0, 10) >= today
        ? revisionSource.validityDate.toISOString().slice(0, 10)
        : addDays(today, 30)
      : addDays(today, 30),
  );
  const [previewTotals, setPreviewTotals] = useState<
    ReturnType<typeof calculateTreatmentEstimateTotals> | undefined
  >();

  useEffect(() => {
    try {
      if (
        rows.some(
          (line) =>
            !line.description.trim() ||
            !line.quantity ||
            !/^\d{1,10}(?:\.\d{1,2})?$/.test(line.unitPrice),
        )
      ) {
        setPreviewTotals(undefined);
        return;
      }
      setPreviewTotals(
        calculateTreatmentEstimateTotals(
          rows.map((line) => ({
            quantity: Number(line.quantity),
            unitPrice: line.unitPrice,
          })),
          discountAmount,
          taxRate,
        ),
      );
    } catch {
      setPreviewTotals(undefined);
    }
  }, [discountAmount, rows, taxRate]);

  function updatePreview(
    nextRows: EstimateProcedureRow[],
    nextDiscount: string,
    nextTaxRate: string,
  ) {
    setRows(nextRows);
    try {
      if (
        nextRows.some(
          (line) =>
            !line.description.trim() ||
            !line.quantity ||
            !/^\d{1,10}(?:\.\d{1,2})?$/.test(line.unitPrice),
        )
      ) {
        setPreviewTotals(undefined);
        return;
      }
      setPreviewTotals(
        calculateTreatmentEstimateTotals(
          nextRows.map((line) => ({
            quantity: Number(line.quantity),
            unitPrice: line.unitPrice,
          })),
          nextDiscount,
          nextTaxRate,
        ),
      );
    } catch {
      setPreviewTotals(undefined);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <form action={formAction} className="space-y-5">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="patientId" type="hidden" value={patientId} />
        <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
        <input
          name="revisionOfEstimateId"
          type="hidden"
          value={revisionSource?.id ?? ""}
        />
        {state.error && (
          <p
            aria-live="polite"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {state.error}
          </p>
        )}
        {state.success && (
          <p
            aria-live="polite"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            role="status"
          >
            {state.success}
          </p>
        )}
        {revisionSource && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">
              Creating version {revisionSource.version + 1}; version{" "}
              {revisionSource.version} remains unchanged.
            </p>
            <p className="mt-1">
              Review all procedure and pricing details and provide a reason.
            </p>
            <label className="mt-3 block space-y-1">
              <span>Revision reason</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-amber-300 bg-white p-2"
                maxLength={1000}
                name="revisionReason"
                required
                defaultValue=""
              />
            </label>
          </div>
        )}
        <section className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Estimate details
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Estimate date</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                defaultValue={today}
                name="estimateDate"
                required
                type="date"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Valid through</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                min={today}
                name="validityDate"
                onChange={(event) => setValidityDate(event.currentTarget.value)}
                required
                type="date"
                value={validityDate}
              />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Procedure breakdown
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Prices are quotation snapshots; no charge or payment is created.
            </p>
          </div>
          <EstimateProcedureRows
            catalogue={catalogue}
            initialRows={initialRows}
            onChange={(nextRows) =>
              updatePreview(nextRows, discountAmount, taxRate)
            }
          />
        </section>

        <section className="rounded-xl border border-slate-200 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Pricing and notes
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700">
              <span>Discount amount (INR)</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                inputMode="decimal"
                name="discountAmount"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDiscountAmount(value);
                  updatePreview(rows, value, taxRate);
                }}
                required
                value={discountAmount}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Tax rate (%)</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                inputMode="decimal"
                name="taxRate"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setTaxRate(value);
                  updatePreview(rows, discountAmount, value);
                }}
                required
                value={taxRate}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Dentist registration (optional)</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                defaultValue={revisionSource?.dentistRegistrationSnapshot ?? ""}
                maxLength={100}
                name="dentistRegistrationNumber"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Notes</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-300 p-3"
                defaultValue={revisionSource?.notes ?? ""}
                maxLength={4000}
                name="notes"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Terms and conditions</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-300 p-3"
                defaultValue={revisionSource?.terms ?? ""}
                maxLength={4000}
                name="terms"
              />
            </label>
          </div>
        </section>
        <div className="flex flex-wrap gap-3">
          <EstimateSubmitButton pendingLabel="Saving estimate…">
            Save estimate
          </EstimateSubmitButton>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-5 text-sm font-medium hover:bg-slate-50"
            href={`/clinic/${clinicId}/patients/${patientId}/treatments/${treatmentPlanId}`}
          >
            Cancel
          </Link>
        </div>
      </form>

      <aside className="h-fit rounded-xl border border-teal-200 bg-teal-50/50 p-5 lg:sticky lg:top-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
          Live quotation preview
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">
          {patientName}
        </h2>
        <p className="text-sm text-slate-600">{treatmentPlanName}</p>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="font-medium text-slate-900">
              {currency(previewTotals?.subtotal ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Discount</dt>
            <dd className="font-medium text-slate-900">
              −
              {currency(previewTotals?.discountAmount ?? (discountAmount || 0))}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">
              Tax {previewTotals ? `(${previewTotals.taxRate}%)` : ""}
            </dt>
            <dd className="font-medium text-slate-900">
              {currency(previewTotals?.taxAmount ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-teal-200 pt-3">
            <dt className="font-semibold text-slate-900">Grand total</dt>
            <dd className="text-lg font-bold text-teal-900">
              {currency(previewTotals?.totalAmount ?? 0)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-slate-600">
          Tax is calculated on the subtotal after discount. Confirm tax
          applicability and rate before issuing this quotation.
        </p>
        <p className="mt-3 text-xs text-slate-600">
          Valid through {validityDate || "—"}
        </p>
      </aside>
    </div>
  );
}
