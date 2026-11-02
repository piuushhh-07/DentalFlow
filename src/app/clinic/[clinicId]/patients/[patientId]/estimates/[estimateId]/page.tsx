import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TreatmentEstimateStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { EstimateStatusControl } from "@/features/estimates/components/estimate-status-control";
import { PrintEstimateButton } from "@/features/estimates/components/print-estimate-button";
import { getClinicTreatmentEstimate } from "@/features/estimates/lib/estimate-repository";

export const dynamic = "force-dynamic";

type EstimatePageProps = Readonly<{
  params: { clinicId: string; patientId: string; estimateId: string };
}>;

const statusLabels: Record<TreatmentEstimateStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CONVERTED: "Converted",
};

function currency(amount: { toString(): string }) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount.toString()));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function getStatusOptions(
  status: TreatmentEstimateStatus,
  validityDate: Date,
  timeZone: string,
): Array<{ value: TreatmentEstimateStatus; label: string }> {
  if (status === TreatmentEstimateStatus.DRAFT) {
    return [{ value: TreatmentEstimateStatus.SENT, label: "Sent to patient" }];
  }
  if (status === TreatmentEstimateStatus.SENT) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (validityDate.toISOString().slice(0, 10) < today) {
      return [
        { value: TreatmentEstimateStatus.EXPIRED, label: "Mark expired" },
      ];
    }
    return [
      { value: TreatmentEstimateStatus.ACCEPTED, label: "Accepted" },
      { value: TreatmentEstimateStatus.REJECTED, label: "Rejected" },
    ];
  }
  if (status === TreatmentEstimateStatus.ACCEPTED) {
    return [
      {
        value: TreatmentEstimateStatus.CONVERTED,
        label: "Mark converted to existing treatment plan",
      },
    ];
  }
  return [];
}

export default async function TreatmentEstimatePage({
  params,
}: EstimatePageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const estimateId = z.string().uuid().safeParse(params.estimateId);
  if (!clinicId.success || !patientId.success || !estimateId.success) {
    notFound();
  }
  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const estimate = await getClinicTreatmentEstimate(
    membership.clinicId,
    patientId.data,
    estimateId.data,
  );
  if (!estimate) notFound();

  const patientPath = `/clinic/${membership.clinicId}/patients/${patientId.data}`;
  const statusOptions = getStatusOptions(
    estimate.status,
    estimate.validityDate,
    estimate.clinic.timeZone,
  );

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 print:hidden"
          href={patientPath}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patient
        </Link>
        <header className="my-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:my-0">
          <div>
            <p className="text-sm font-medium text-teal-700">
              Treatment quotation · Version {estimate.version}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              {estimate.clinicNameSnapshot}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Estimate #{estimate.id.slice(0, 8).toUpperCase()} ·{" "}
              {statusLabels[estimate.status]}
            </p>
          </div>
          <PrintEstimateButton />
        </header>

        <article
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none"
          id="treatment-estimate-document"
        >
          <div className="mb-6 border-b border-slate-200 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              Treatment quotation · Version {estimate.version}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              {estimate.clinicNameSnapshot}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Quotation #{estimate.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <div className="grid gap-5 border-b border-slate-200 pb-5 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prepared for
              </h2>
              <p className="mt-2 font-semibold text-slate-900">
                {estimate.patientNameSnapshot}
              </p>
              <p className="text-sm text-slate-600">
                {estimate.patientPhoneSnapshot}
              </p>
            </div>
            <div className="sm:text-right">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estimate details
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Issued {formatDate(estimate.estimateDate)}
              </p>
              <p className="text-sm text-slate-700">
                Valid through {formatDate(estimate.validityDate)}
              </p>
              <p className="text-sm text-slate-700">
                Treatment: {estimate.treatmentPlan.name}
              </p>
            </div>
          </div>
          {(estimate.clinicAddressSnapshot ||
            estimate.clinicPhoneSnapshot ||
            estimate.clinicEmailSnapshot) && (
            <div className="border-b border-slate-200 py-4 text-sm text-slate-600">
              {estimate.clinicAddressSnapshot && (
                <p>{estimate.clinicAddressSnapshot}</p>
              )}
              <p>
                {[estimate.clinicPhoneSnapshot, estimate.clinicEmailSnapshot]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-3">Procedure</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 text-right">Unit price</th>
                  <th className="py-3 pl-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estimate.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-3 pr-3 font-medium text-slate-800">
                      {line.description}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {line.quantity}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {currency(line.unitPrice)}
                    </td>
                    <td className="py-3 pl-3 text-right font-medium text-slate-800">
                      {currency(line.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-5 max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-medium">{currency(estimate.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Discount</dt>
              <dd className="font-medium">
                −{currency(estimate.discountAmount)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">
                Tax ({estimate.taxRate.toFixed(2)}%)
              </dt>
              <dd className="font-medium">{currency(estimate.taxAmount)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base">
              <dt className="font-semibold text-slate-900">Grand total</dt>
              <dd className="font-bold text-slate-900">
                {currency(estimate.totalAmount)}
              </dd>
            </div>
          </dl>

          {estimate.notes && (
            <section className="mt-6 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {estimate.notes}
              </p>
            </section>
          )}
          {estimate.terms && (
            <section className="mt-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Terms and conditions
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {estimate.terms}
              </p>
            </section>
          )}
          <footer className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <p>
              Prepared by {estimate.dentistNameSnapshot}
              {estimate.dentistRegistrationSnapshot
                ? ` · Registration ${estimate.dentistRegistrationSnapshot}`
                : ""}
            </p>
            <p className="mt-1 text-xs">
              Created {formatDate(estimate.createdAt)}. This is an estimate, not
              a receipt or payment record.
            </p>
          </footer>
        </article>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 print:hidden">
          <h2 className="text-base font-semibold text-slate-900">
            Estimate history
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {estimate.revisionOf && (
              <Link
                className="block text-teal-800 hover:underline"
                href={`${patientPath}/estimates/${estimate.revisionOf.id}`}
              >
                View previous version {estimate.revisionOf.version} ·{" "}
                {statusLabels[estimate.revisionOf.status]}
              </Link>
            )}
            {estimate.revisions.map((revision) => (
              <Link
                className="block text-teal-800 hover:underline"
                href={`${patientPath}/estimates/${revision.id}`}
                key={revision.id}
              >
                View version {revision.version} ·{" "}
                {statusLabels[revision.status]}
              </Link>
            ))}
            {!estimate.revisions.length && (
              <Link
                className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50"
                href={`${patientPath}/treatments/${estimate.treatmentPlanId}/estimates/new?revisionOfEstimateId=${estimate.id}`}
              >
                Create a new version
              </Link>
            )}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Status and audit trail
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {estimate.audits.map((audit) => (
                <li className="text-slate-700" key={audit.id}>
                  <span className="font-medium">
                    {audit.action === "STATUS_CHANGED" && audit.toStatus
                      ? statusLabels[audit.toStatus]
                      : audit.action === "REVISED"
                        ? "Revised"
                        : "Created"}
                  </span>
                  {" · "}
                  {audit.actorNameSnapshot ??
                    audit.actor.user.displayName ??
                    "Clinic member"}{" "}
                  · {formatDate(audit.createdAt)}
                  {audit.note ? ` · ${audit.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
          {estimate.status === TreatmentEstimateStatus.CONVERTED && (
            <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              This accepted estimate is linked to the existing treatment plan.
              No charge or payment entry was created.
            </p>
          )}
          <div className="mt-5">
            <EstimateStatusControl
              clinicId={membership.clinicId}
              estimateId={estimate.id}
              options={statusOptions}
              patientId={patientId.data}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
