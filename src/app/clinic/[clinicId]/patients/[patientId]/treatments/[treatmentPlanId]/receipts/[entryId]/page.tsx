import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { PrintReceiptButton } from "@/features/treatments/components/print-receipt-button";
import {
  getTreatmentPaymentReceipt,
  paymentMethodLabels,
} from "@/features/treatments/lib/treatment-finance";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function TreatmentPaymentReceiptPage({
  params,
}: {
  params: {
    clinicId: string;
    patientId: string;
    treatmentPlanId: string;
    entryId: string;
  };
}) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const planId = z.string().uuid().safeParse(params.treatmentPlanId);
  const entryId = z.string().uuid().safeParse(params.entryId);
  if (
    !clinicId.success ||
    !patientId.success ||
    !planId.success ||
    !entryId.success
  )
    notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const receipt = await getTreatmentPaymentReceipt(
    membership.clinicId,
    patientId.data,
    planId.data,
    entryId.data,
  );
  if (!receipt) notFound();

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <Link
            className="text-sm font-medium text-teal-800 hover:underline"
            href={`/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${planId.data}`}
          >
            Back to treatment
          </Link>
          <PrintReceiptButton />
        </div>
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none">
          <header className="border-b border-dashed border-slate-300 pb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Payment receipt
            </p>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">
              {receipt.clinic.name}
            </h1>
            {receipt.clinic.address && (
              <p className="mt-1 text-sm text-slate-600">
                {receipt.clinic.address}
              </p>
            )}
            {receipt.clinic.phoneNumber && (
              <p className="mt-1 text-sm text-slate-600">
                Phone: {receipt.clinic.phoneNumber}
              </p>
            )}
          </header>
          <dl className="grid gap-x-6 gap-y-5 py-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Receipt number
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {receipt.receiptNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Date
              </dt>
              <dd className="mt-1 text-slate-900">
                {dateTime.format(receipt.paidAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Patient
              </dt>
              <dd className="mt-1 text-slate-900">
                {receipt.patient.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Treatment
              </dt>
              <dd className="mt-1 text-slate-900">
                {receipt.treatmentPlan.name}
              </dd>
            </div>
          </dl>
          <div className="space-y-3 border-y border-slate-200 py-5">
            <div className="flex justify-between gap-4">
              <span className="text-sm text-slate-600">Amount received</span>
              <strong className="text-lg text-slate-900">
                {inr.format(receipt.amount.toNumber())}
              </strong>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-slate-600">Method</span>
              <span>
                {receipt.paymentMethod
                  ? paymentMethodLabels[receipt.paymentMethod]
                  : "—"}
              </span>
            </div>
            {receipt.reference && (
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-600">Reference</span>
                <span className="break-all text-right">
                  {receipt.reference}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-slate-600">Balance after payment</span>
              <span className="font-semibold">
                {inr.format(Math.max(0, receipt.balanceAfter?.toNumber() ?? 0))}
                {(receipt.balanceAfter?.toNumber() ?? 0) < 0
                  ? ` · Credit ${inr.format(Math.abs(receipt.balanceAfter!.toNumber()))}`
                  : ""}
              </span>
            </div>
          </div>
          <p className="pt-6 text-center text-xs text-slate-500">
            Computer-generated receipt · DentalFlow
          </p>
        </article>
      </div>
    </AppShell>
  );
}
