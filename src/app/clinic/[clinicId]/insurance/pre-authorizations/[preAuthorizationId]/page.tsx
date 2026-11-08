import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { updateInsurancePreAuthorizationStatusAction } from "@/features/insurance/actions";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { getInsurancePreAuthorization } from "@/features/insurance/lib/insurance-repository";
import {
  getAvailablePreAuthorizationTransitions,
  maskPolicyIdentifier,
} from "@/features/insurance/lib/insurance-validation";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const amountFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

type PreAuthorizationDetailProps = Readonly<{
  params: { clinicId: string; preAuthorizationId: string };
  searchParams: { created?: string; error?: string; updated?: string };
}>;

export default async function PreAuthorizationDetailPage({
  params,
  searchParams,
}: PreAuthorizationDetailProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const requestId = z.string().uuid().safeParse(params.preAuthorizationId);
  if (!clinicId.success || !requestId.success) notFound();
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
  const request = await getInsurancePreAuthorization(
    membership.clinicId,
    requestId.data,
  );
  if (!request) notFound();
  const availableStatuses = getAvailablePreAuthorizationTransitions(
    request.status,
  );
  const basePath = `/clinic/${membership.clinicId}/insurance/pre-authorizations`;

  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
          href={basePath}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to pre-authorizations
        </Link>
        <header className="mt-5">
          <p className="text-sm font-medium text-teal-700">
            Cashless pre-authorization
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {request.patient.fullName}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {request.policy.provider.name} ·{" "}
            {maskPolicyIdentifier(request.policy.policyNumber)}
          </p>
        </header>
        <div className="mt-5">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Pre-authorizations"
          />
        </div>
        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            That status change was not saved. Check the insurer decision details
            and allowed workflow.
          </p>
        )}
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">Status</h2>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {request.status.replaceAll("_", " ")}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Estimate:{" "}
              <span className="font-semibold text-slate-900">
                {amountFormatter.format(Number(request.estimatedCost))}
              </span>
            </p>
            {request.approvedAmount && (
              <p className="mt-1 text-sm text-slate-600">
                Explicitly approved:{" "}
                <span className="font-semibold text-emerald-800">
                  {amountFormatter.format(Number(request.approvedAmount))}
                </span>
              </p>
            )}
            {request.expiresAt && (
              <p className="mt-1 text-sm text-slate-600">
                Approval expires {dateFormatter.format(request.expiresAt)}
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-amber-800">
              An estimate, submission or “needs documents” status is not a
              confirmed approval.
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">
              Request details
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {request.proposedTreatment}
            </p>
            {request.requestReference && (
              <p className="mt-3 text-sm text-slate-600">
                Request reference:{" "}
                <span className="font-medium text-slate-800">
                  {request.requestReference}
                </span>
              </p>
            )}
            {request.treatmentPlan && (
              <p className="mt-2 text-sm text-slate-600">
                Treatment plan: {request.treatmentPlan.name}
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Created {dateFormatter.format(request.createdAt)}
            </p>
          </article>
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">
            Record insurer response or update request
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Record only a decision you have received from the insurer. Partial
            approvals must be less than the estimate; full approvals must match
            the estimate.
          </p>
          {availableStatuses.length > 0 ? (
            <form
              action={updateInsurancePreAuthorizationStatusAction}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <input
                name="clinicId"
                type="hidden"
                value={membership.clinicId}
              />
              <input
                name="preAuthorizationId"
                type="hidden"
                value={request.id}
              />
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                  htmlFor="preauth-status"
                >
                  New status
                </label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
                  defaultValue={availableStatuses[0]}
                  id="preauth-status"
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
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                  htmlFor="approvedAmount"
                >
                  Approved amount (INR, for approval)
                </label>
                <input
                  className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
                  defaultValue={request.approvedAmount?.toString() ?? ""}
                  id="approvedAmount"
                  min="0"
                  name="approvedAmount"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                  htmlFor="expiresAt"
                >
                  Approval expiry date (optional)
                </label>
                <input
                  className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
                  defaultValue={
                    request.expiresAt?.toISOString().slice(0, 10) ?? ""
                  }
                  id="expiresAt"
                  name="expiresAt"
                  type="date"
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                  htmlFor="rejectionReason"
                >
                  Rejection reason (required if rejected)
                </label>
                <input
                  className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm"
                  id="rejectionReason"
                  maxLength={5000}
                  name="rejectionReason"
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                  htmlFor="conditions"
                >
                  Conditions or insurer response notes
                </label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                  defaultValue={request.conditions ?? ""}
                  id="conditions"
                  maxLength={5000}
                  name="conditions"
                  rows={3}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                  type="submit"
                >
                  Save insurer response
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              This pre-authorization has no further status transitions.
            </p>
          )}
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">Activity history</h2>
          {request.activities.length ? (
            <ol className="mt-4 space-y-4">
              {request.activities.map((activity) => (
                <li
                  className="border-l-2 border-teal-100 pl-4"
                  key={activity.id}
                >
                  <p className="text-sm font-medium text-slate-900">
                    {activity.summary}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {activity.actor.user.displayName} ·{" "}
                    {dateFormatter.format(activity.createdAt)}
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
