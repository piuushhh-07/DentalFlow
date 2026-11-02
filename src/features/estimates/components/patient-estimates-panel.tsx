import Link from "next/link";
import { TreatmentEstimateStatus } from "@prisma/client";

import type { PatientTreatmentEstimate } from "@/features/estimates/lib/estimate-repository";

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

export function PatientEstimatesPanel({
  clinicId,
  patientId,
  estimates,
}: Readonly<{
  clinicId: string;
  patientId: string;
  estimates: PatientTreatmentEstimate[];
}>) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header>
        <h2 className="text-base font-semibold text-slate-900">
          Treatment estimates and quotations
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Historical estimates are preserved as versions and are separate from
          charges and payments.
        </p>
      </header>
      {estimates.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {estimates.map((estimate) => (
            <li
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              key={estimate.id}
            >
              <div>
                <Link
                  className="font-medium text-teal-800 hover:underline"
                  href={`/clinic/${clinicId}/patients/${patientId}/estimates/${estimate.id}`}
                >
                  {estimate.treatmentPlan.name} · Version {estimate.version}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {currency(estimate.totalAmount)} ·{" "}
                  {statusLabels[estimate.status]} · valid through{" "}
                  {formatDate(estimate.validityDate)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Created {formatDate(estimate.createdAt)}
                  {estimate.createdBy.user.displayName
                    ? ` by ${estimate.createdBy.user.displayName}`
                    : ""}
                  {estimate.revisionOf
                    ? ` · revises version ${estimate.revisionOf.version}`
                    : ""}
                </p>
              </div>
              <Link
                className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50"
                href={`/clinic/${clinicId}/patients/${patientId}/estimates/${estimate.id}`}
              >
                View quotation
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No estimates have been created for this patient.
        </p>
      )}
    </section>
  );
}
