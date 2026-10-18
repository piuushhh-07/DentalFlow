"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import {
  recordFinancialEntry,
  type TreatmentActionState,
} from "@/features/treatments/actions";
import { TreatmentFinanceSubmitButton } from "@/features/treatments/components/treatment-finance-submit-button";

const initialState: TreatmentActionState = {};
const paymentMethods = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["CARD", "Card"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["OTHER", "Other"],
] as const;

export function TreatmentFinancialEntryForm({
  clinicId,
  patientId,
  treatmentPlanId,
  requestKey,
  today,
  owner,
}: {
  clinicId: string;
  patientId: string;
  treatmentPlanId: string;
  requestKey: string;
  today: string;
  owner: boolean;
}) {
  const [state, action] = useFormState(recordFinancialEntry, initialState);
  const [entryType, setEntryType] = useState("PAYMENT");

  return (
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      <input name="treatmentPlanId" type="hidden" value={treatmentPlanId} />
      <input name="requestKey" type="hidden" value={requestKey} />
      {state.error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Entry type
        <select
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          name="entryType"
          onChange={(event) => setEntryType(event.target.value)}
          value={entryType}
        >
          <option value="PAYMENT">Payment</option>
          {owner && (
            <>
              <option value="DISCOUNT">Discount (owner)</option>
              <option value="REFUND">Refund (owner)</option>
            </>
          )}
        </select>
      </label>
      {entryType === "DISCOUNT" ? (
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Discount type
          <select
            className="h-10 w-full rounded-md border border-input bg-white px-3"
            name="discountMode"
          >
            <option value="FIXED">Fixed amount (INR)</option>
            <option value="PERCENT">Percentage</option>
          </select>
        </label>
      ) : (
        <span />
      )}
      <label className="space-y-2 text-sm font-medium text-slate-700">
        {entryType === "DISCOUNT"
          ? "Discount value"
          : entryType === "REFUND"
            ? "Refund amount (INR)"
            : "Payment amount (INR)"}
        <input
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          min="0.01"
          name="amount"
          required
          step="0.01"
          type="number"
        />
      </label>
      {entryType === "PAYMENT" ? (
        <>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Payment method
            <select
              className="h-10 w-full rounded-md border border-input bg-white px-3"
              name="paymentMethod"
            >
              {paymentMethods.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Payment date
            <input
              className="h-10 w-full rounded-md border border-input bg-white px-3"
              defaultValue={today}
              name="paidAt"
              required
              type="date"
            />
          </label>
        </>
      ) : (
        <input name="paidAt" type="hidden" value={`${today}T12:00:00.000Z`} />
      )}
      <label className="space-y-2 text-sm font-medium text-slate-700">
        Reference (optional)
        <input
          className="h-10 w-full rounded-md border border-input bg-white px-3"
          maxLength={120}
          name="reference"
        />
      </label>
      <label className="space-y-2 text-sm font-medium text-slate-700">
        {entryType === "PAYMENT" ? "Notes (optional)" : "Reason (required)"}
        <textarea
          className="min-h-10 w-full rounded-md border border-input bg-white px-3 py-2"
          maxLength={2000}
          name="notes"
          required={entryType !== "PAYMENT"}
          rows={2}
        />
      </label>
      {state.errors?.amount?.[0] && (
        <p className="text-sm text-red-700">{state.errors.amount[0]}</p>
      )}
      {state.errors?.notes?.[0] && (
        <p className="text-sm text-red-700">{state.errors.notes[0]}</p>
      )}
      <div className="sm:col-span-2">
        <TreatmentFinanceSubmitButton pendingLabel="Recording...">
          Save{" "}
          {entryType === "PAYMENT"
            ? "payment"
            : entryType === "REFUND"
              ? "refund"
              : "discount"}
        </TreatmentFinanceSubmitButton>
      </div>
    </form>
  );
}
