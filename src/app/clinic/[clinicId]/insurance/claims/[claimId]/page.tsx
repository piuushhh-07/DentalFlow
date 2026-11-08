import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import {
  createInsuranceDocumentRequirementAction,
  createInsurancePaymentAction,
  scheduleInsuranceFollowUpAction,
  updateInsuranceClaimDetailsAction,
  updateInsuranceClaimStatusAction,
  updateInsuranceDocumentStatusAction,
} from "@/features/insurance/actions";
import { InsuranceDocumentFile } from "@/features/insurance/components/insurance-document-file";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { getInsuranceClaim } from "@/features/insurance/lib/insurance-repository";
import {
  amountToPaise,
  calculateOutstandingPaise,
  formatPaise,
  getAvailableClaimTransitions,
  maskPolicyIdentifier,
} from "@/features/insurance/lib/insurance-validation";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const amountFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const fieldClass =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

type InsuranceClaimDetailProps = Readonly<{
  params: { clinicId: string; claimId: string };
  searchParams: {
    created?: string;
    error?: string;
    payment?: string;
    updated?: string;
  };
}>;

export default async function InsuranceClaimDetailPage({
  params,
  searchParams,
}: InsuranceClaimDetailProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const claimId = z.string().uuid().safeParse(params.claimId);
  if (!clinicId.success || !claimId.success) notFound();
  let membership;
  try {
    membership = await requireClinicPermission(
      clinicId.data,
      ClinicPermission.INSURANCE,
    );
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const claim = await getInsuranceClaim(membership.clinicId, claimId.data);
  if (!claim) notFound();
  const basePath = `/clinic/${membership.clinicId}/insurance`;
  const patientPaidPaise = claim.payments
    .filter((payment) => payment.kind === "PATIENT_PAYMENT")
    .reduce(
      (total, payment) => total + amountToPaise(payment.amount.toString()),
      BigInt(0),
    );
  const insurerPaidPaise = claim.payments
    .filter((payment) => payment.kind === "INSURER_PAYMENT")
    .reduce(
      (total, payment) => total + amountToPaise(payment.amount.toString()),
      BigInt(0),
    );
  const outstandingPaise = calculateOutstandingPaise(
    claim.amountApproved?.toString() ?? null,
    claim.payments
      .filter((payment) => payment.kind === "INSURER_PAYMENT")
      .map((payment) => payment.amount.toString()),
  );
  const canEdit = ["DRAFT", "NEEDS_DOCUMENTS", "REJECTED"].includes(
    claim.status,
  );
  const availableStatuses = getAvailableClaimTransitions(claim.status);
  const patientUrl = `/clinic/${membership.clinicId}/patients/${claim.patientId}`;

  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`${basePath}/claims`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to claims
        </Link>
        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">
              {claim.type === "CASHLESS"
                ? "Cashless claim"
                : "Reimbursement claim"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {claim.patient.fullName}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {claim.policy.provider.name} ·{" "}
              {maskPolicyIdentifier(claim.policy.policyNumber)}
              {claim.claimReference ? ` · Ref ${claim.claimReference}` : ""}
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-white px-4 text-sm font-medium hover:bg-slate-50"
            href={patientUrl}
          >
            Patient record
            <ExternalLink aria-hidden="true" className="size-4" />
          </Link>
        </header>
        <div className="mt-5">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Claims"
          />
        </div>
        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The requested update could not be saved. Check the status rules,
            amounts and required documents, then try again.
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Claim status</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {claim.status.replaceAll("_", " ")}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {claim.treatmentDetails}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Amount claimed</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {amountFormatter.format(Number(claim.amountClaimed))}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Estimate {amountFormatter.format(Number(claim.estimatedCost))}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Explicitly approved
            </p>
            <p className="mt-2 text-xl font-semibold text-emerald-800">
              {claim.amountApproved
                ? amountFormatter.format(Number(claim.amountApproved))
                : "Not approved"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              An estimate or submission is not approval.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Insurer outstanding
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {amountFormatter.format(Number(formatPaise(outstandingPaise)))}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Insurer payments recorded:{" "}
              {amountFormatter.format(Number(formatPaise(insurerPaidPaise)))}
            </p>
          </article>
        </section>

        {claim.rejectionReason && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Rejection reason: {claim.rejectionReason}
          </p>
        )}

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">Claim workflow</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {canEdit && (
              <form
                action={updateInsuranceClaimDetailsAction}
                className="space-y-4"
              >
                <input
                  name="clinicId"
                  type="hidden"
                  value={membership.clinicId}
                />
                <input name="claimId" type="hidden" value={claim.id} />
                <h3 className="text-sm font-semibold text-slate-800">
                  Edit claim details
                </h3>
                <div>
                  <label className={labelClass} htmlFor="edit-treatmentDetails">
                    Treatment details
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                    defaultValue={claim.treatmentDetails}
                    id="edit-treatmentDetails"
                    maxLength={2000}
                    name="treatmentDetails"
                    required
                    rows={3}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="edit-treatmentDate">
                      Treatment date
                    </label>
                    <input
                      className={fieldClass}
                      defaultValue={claim.treatmentDate
                        .toISOString()
                        .slice(0, 10)}
                      id="edit-treatmentDate"
                      name="treatmentDate"
                      required
                      type="date"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="edit-estimatedCost">
                      Estimated cost (INR)
                    </label>
                    <input
                      className={fieldClass}
                      defaultValue={claim.estimatedCost.toString()}
                      id="edit-estimatedCost"
                      min="0"
                      name="estimatedCost"
                      required
                      step="0.01"
                      type="number"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="edit-amountClaimed">
                      Amount claimed (INR)
                    </label>
                    <input
                      className={fieldClass}
                      defaultValue={claim.amountClaimed.toString()}
                      id="edit-amountClaimed"
                      min="0"
                      name="amountClaimed"
                      required
                      step="0.01"
                      type="number"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="claimReference">
                      Claim reference
                    </label>
                    <input
                      className={fieldClass}
                      defaultValue={claim.claimReference ?? ""}
                      id="claimReference"
                      maxLength={120}
                      name="claimReference"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="claim-notes">
                    Internal notes
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                    defaultValue={claim.notes ?? ""}
                    id="claim-notes"
                    maxLength={10000}
                    name="notes"
                    rows={3}
                  />
                </div>
                <button
                  className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold hover:bg-slate-50"
                  type="submit"
                >
                  Save claim details
                </button>
              </form>
            )}
            {availableStatuses.length > 0 ? (
              <form
                action={updateInsuranceClaimStatusAction}
                className="space-y-4"
              >
                <input
                  name="clinicId"
                  type="hidden"
                  value={membership.clinicId}
                />
                <input name="claimId" type="hidden" value={claim.id} />
                <h3 className="text-sm font-semibold text-slate-800">
                  Record workflow status or insurer decision
                </h3>
                <div>
                  <label className={labelClass} htmlFor="claim-status">
                    New status
                  </label>
                  <select
                    className={fieldClass}
                    defaultValue={availableStatuses[0]}
                    id="claim-status"
                    name="status"
                  >
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="approvedAmount">
                    Approved amount (INR)
                  </label>
                  <input
                    className={fieldClass}
                    defaultValue={claim.amountApproved?.toString() ?? ""}
                    id="approvedAmount"
                    min="0"
                    name="approvedAmount"
                    step="0.01"
                    type="number"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Required only for approved or partially approved decisions.
                  </p>
                </div>
                <div>
                  <label className={labelClass} htmlFor="rejectionReason">
                    Rejection reason (required if rejected)
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                    defaultValue={claim.rejectionReason ?? ""}
                    id="rejectionReason"
                    maxLength={5000}
                    name="rejectionReason"
                    rows={3}
                  />
                </div>
                <button
                  className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                  type="submit"
                >
                  Save status
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-600">
                This claim is closed and has no further status transitions.
              </p>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-semibold text-slate-900">Record a payment</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Patient payments and insurer payments are stored separately.
              Insurer payments cannot exceed the recorded approval.
            </p>
            <form
              action={createInsurancePaymentAction}
              className="mt-4 space-y-4"
            >
              <input
                name="clinicId"
                type="hidden"
                value={membership.clinicId}
              />
              <input name="claimId" type="hidden" value={claim.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="payment-kind">
                    Payment source
                  </label>
                  <select className={fieldClass} id="payment-kind" name="kind">
                    <option value="PATIENT_PAYMENT">Patient paid</option>
                    <option value="INSURER_PAYMENT">Insurer paid</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="payment-amount">
                    Amount (INR)
                  </label>
                  <input
                    className={fieldClass}
                    id="payment-amount"
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="payment-date">
                    Payment date and time
                  </label>
                  <input
                    className={fieldClass}
                    id="payment-date"
                    name="paidAt"
                    required
                    type="datetime-local"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="payment-reference">
                    Receipt / reference
                  </label>
                  <input
                    className={fieldClass}
                    id="payment-reference"
                    maxLength={120}
                    name="reference"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="payment-notes">
                  Notes
                </label>
                <textarea
                  className="min-h-16 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                  id="payment-notes"
                  maxLength={2000}
                  name="notes"
                  rows={2}
                />
              </div>
              <button
                className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold hover:bg-slate-50"
                type="submit"
              >
                Record payment
              </button>
            </form>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-sm text-slate-600">
                Patient paid:{" "}
                <span className="font-semibold text-slate-900">
                  {amountFormatter.format(
                    Number(formatPaise(patientPaidPaise)),
                  )}
                </span>
              </p>
            </div>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-semibold text-slate-900">Claim follow-up</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Set a date to remind the clinic to follow up with the insurer.
            </p>
            <form
              action={scheduleInsuranceFollowUpAction}
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <input
                name="clinicId"
                type="hidden"
                value={membership.clinicId}
              />
              <input name="claimId" type="hidden" value={claim.id} />
              <div className="flex-1">
                <label className={labelClass} htmlFor="followUpDate">
                  Follow-up date
                </label>
                <input
                  className={fieldClass}
                  defaultValue={
                    claim.followUpAt?.toISOString().slice(0, 10) ?? ""
                  }
                  id="followUpDate"
                  name="followUpDate"
                  type="date"
                />
              </div>
              <button
                className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-slate-50"
                type="submit"
              >
                Save follow-up
              </button>
            </form>
            {claim.followUpAt && (
              <p className="mt-3 text-sm text-slate-600">
                Scheduled for {dateFormatter.format(claim.followUpAt)}.
              </p>
            )}
          </article>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="font-semibold text-slate-900">Claim documents</h2>
            <p className="mt-1 text-sm text-slate-600">
              Files are stored in the private insurance bucket. Access is
              checked for the signed-in clinic member and claim.
            </p>
          </div>
          {claim.documents.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {claim.documents.map((document) => (
                <li
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                  key={document.id}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {document.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {document.type.replaceAll("_", " ")} ·{" "}
                      {document.status.toLowerCase().replaceAll("_", " ")}
                    </p>
                    {document.rejectionReason && (
                      <p className="mt-1 text-xs text-rose-700">
                        Rejected: {document.rejectionReason}
                      </p>
                    )}
                    <div className="mt-2">
                      <InsuranceDocumentFile
                        canUpload={
                          document.status === "REQUIRED" ||
                          document.status === "REJECTED"
                        }
                        claimId={claim.id}
                        clinicId={membership.clinicId}
                        documentId={document.id}
                        name={document.name}
                        pendingCleanupPaths={document.pendingCleanupPaths}
                        storagePath={document.storagePath}
                      />
                    </div>
                  </div>
                  {document.status === "RECEIVED" && (
                    <form
                      action={updateInsuranceDocumentStatusAction}
                      className="grid w-full gap-2 sm:max-w-sm sm:grid-cols-2"
                    >
                      <input
                        name="clinicId"
                        type="hidden"
                        value={membership.clinicId}
                      />
                      <input name="claimId" type="hidden" value={claim.id} />
                      <input
                        name="documentId"
                        type="hidden"
                        value={document.id}
                      />
                      <select
                        className={fieldClass}
                        defaultValue="VERIFIED"
                        name="status"
                      >
                        <option value="VERIFIED">Verify</option>
                        <option value="REJECTED">Reject</option>
                      </select>
                      <input
                        className={fieldClass}
                        maxLength={2000}
                        name="rejectionReason"
                        placeholder="Reason if rejected"
                      />
                      <button
                        className="min-h-9 rounded-md border px-3 text-sm font-semibold hover:bg-slate-50 sm:col-span-2"
                        type="submit"
                      >
                        Save document review
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              No claim documents have been added.
            </p>
          )}
          <form
            action={createInsuranceDocumentRequirementAction}
            className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[1fr_2fr_auto]"
          >
            <input name="clinicId" type="hidden" value={membership.clinicId} />
            <input name="claimId" type="hidden" value={claim.id} />
            <div>
              <label className={labelClass} htmlFor="document-type">
                Document type
              </label>
              <select className={fieldClass} id="document-type" name="type">
                <option value="CLAIM_FORM">Claim form</option>
                <option value="POLICY_COPY">Policy copy</option>
                <option value="TREATMENT_ESTIMATE">Treatment estimate</option>
                <option value="TREATMENT_PLAN">Treatment plan</option>
                <option value="INVOICE">Invoice</option>
                <option value="PRESCRIPTION">Prescription</option>
                <option value="DIAGNOSTIC_REPORT">Diagnostic report</option>
                <option value="DISCHARGE_SUMMARY">Discharge summary</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="document-name">
                Required document name
              </label>
              <input
                className={fieldClass}
                id="document-name"
                maxLength={160}
                name="name"
                required
              />
            </div>
            <button
              className="mt-auto inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold hover:bg-slate-50"
              type="submit"
            >
              Add requirement
            </button>
          </form>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">Payment history</h2>
          {claim.payments.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Paid at</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Recorded by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {claim.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-3 py-3">
                        {payment.kind === "PATIENT_PAYMENT"
                          ? "Patient"
                          : "Insurer"}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {amountFormatter.format(Number(payment.amount))}
                      </td>
                      <td className="px-3 py-3">
                        {dateTimeFormatter.format(payment.paidAt)}
                      </td>
                      <td className="px-3 py-3">{payment.reference ?? "—"}</td>
                      <td className="px-3 py-3">
                        {payment.recordedById === membership.userId
                          ? "You"
                          : "Clinic staff"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              No payments have been recorded.
            </p>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">Activity history</h2>
          {claim.activities.length ? (
            <ol className="mt-4 space-y-4">
              {claim.activities.map((activity) => (
                <li
                  className="border-l-2 border-teal-100 pl-4"
                  key={activity.id}
                >
                  <p className="text-sm font-medium text-slate-900">
                    {activity.summary}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {activity.actor.user.displayName} ·{" "}
                    {dateTimeFormatter.format(activity.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              No activity has been recorded.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
