import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  FileCheck2,
  FileClock,
  IndianRupee,
  ListChecks,
} from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { getInsuranceDashboard } from "@/features/insurance/lib/insurance-repository";

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

type InsuranceDashboardPageProps = Readonly<{
  params: { clinicId: string };
}>;

export default async function InsuranceDashboardPage({
  params,
}: InsuranceDashboardPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

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

  const metrics = await getInsuranceDashboard(membership.clinicId);
  const cards = [
    {
      label: "Claims in progress",
      value: metrics.claimsInProgress,
      icon: ListChecks,
      tone: "bg-teal-50 text-teal-800",
    },
    {
      label: "Pending pre-authorizations",
      value: metrics.pendingPreAuthorizations,
      icon: FileClock,
      tone: "bg-blue-50 text-blue-800",
    },
    {
      label: "Missing documents",
      value: metrics.missingDocuments,
      icon: AlertCircle,
      tone: "bg-amber-50 text-amber-800",
    },
    {
      label: "Rejected or partially approved",
      value: metrics.rejectedOrPartialClaims,
      icon: FileCheck2,
      tone: "bg-rose-50 text-rose-800",
    },
    {
      label: "Outstanding insurer payments",
      value: amountFormatter.format(Number(metrics.outstandingInsurerPayments)),
      icon: IndianRupee,
      tone: "bg-violet-50 text-violet-800",
    },
    {
      label: "Follow-ups in the next 30 days",
      value: metrics.upcomingFollowUps,
      icon: FileClock,
      tone: "bg-sky-50 text-sky-800",
    },
  ] as const;

  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="text-sm font-medium text-teal-700">Clinic workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Insurance management
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Keep insurer details, patient policies and claim follow-ups
            together. Coverage is confirmed only when you record the
            insurer&apos;s decision.
          </p>
        </header>

        <InsuranceNavigation
          clinicId={membership.clinicId}
          current="Overview"
        />

        <section
          aria-label="Insurance dashboard metrics"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              key={label}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-600">{label}</h2>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}
                >
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                {typeof value === "number"
                  ? value.toLocaleString("en-IN")
                  : value}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">Recent claims</h2>
              <p className="mt-1 text-sm text-slate-500">
                Latest claims created in this clinic.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-teal-800 hover:underline"
              href={`/clinic/${membership.clinicId}/insurance/claims`}
            >
              All claims
            </Link>
          </div>
          {metrics.recentClaims.length ? (
            <ul className="divide-y divide-slate-100">
              {metrics.recentClaims.map((claim) => (
                <li key={claim.id}>
                  <Link
                    className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    href={`/clinic/${membership.clinicId}/insurance/claims/${claim.id}`}
                  >
                    <span>
                      <span className="block font-medium text-slate-900">
                        {claim.patient.fullName}
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {claim.policy.provider.name} ·{" "}
                        {claim.type.toLowerCase()}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-800">
                        {amountFormatter.format(Number(claim.amountClaimed))}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {claim.status.replaceAll("_", " ")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {dateFormatter.format(claim.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-14 text-center">
              <h3 className="font-semibold text-slate-900">No claims yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Add a patient policy first, then start a cashless or
                reimbursement claim.
              </p>
              <Link
                className="mt-4 inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                href={`/clinic/${membership.clinicId}/insurance/policies/new`}
              >
                Add a policy
              </Link>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
