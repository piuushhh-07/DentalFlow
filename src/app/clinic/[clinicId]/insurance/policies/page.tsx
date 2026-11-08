import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { listInsurancePoliciesPage } from "@/features/insurance/lib/insurance-repository";
import { maskPolicyIdentifier } from "@/features/insurance/lib/insurance-validation";

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

type InsurancePoliciesPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    query?: string;
    created?: string;
    error?: string;
    page?: string;
  };
}>;

export default async function InsurancePoliciesPage({
  params,
  searchParams,
}: InsurancePoliciesPageProps) {
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
  const query = (searchParams.query ?? "").trim().slice(0, 100);
  const requestedPage = z.coerce
    .number()
    .int()
    .min(1)
    .catch(1)
    .parse(searchParams.page);
  const { policies, pagination } = await listInsurancePoliciesPage(
    membership.clinicId,
    query,
    requestedPage,
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const basePath = `/clinic/${membership.clinicId}/insurance/policies`;
  const pageHref = (page: number) => {
    const search = new URLSearchParams();
    if (query) search.set("query", query);
    search.set("page", String(page));
    return `${basePath}?${search.toString()}`;
  };

  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Insurance</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Patient policies
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track policy periods and reference coverage information.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href={`${basePath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add policy
          </Link>
        </header>
        <div className="mt-6">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Policies"
          />
        </div>
        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The policy could not be saved. Verify the patient, provider and
            dates.
          </p>
        )}
        <form action={basePath} className="mb-5 flex gap-2" role="search">
          <label className="relative block flex-1">
            <span className="sr-only">Search policies</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={query}
              maxLength={100}
              name="query"
              placeholder="Search patient or provider"
              type="search"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {policies.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h2 className="font-semibold text-slate-900">
                {query ? "No matching policies" : "No patient policies yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Add a policy to a patient before creating an insurance claim.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {policies.map((policy) => {
                const expired =
                  policy.validUntil.toISOString().slice(0, 10) < today;
                const startsLater =
                  policy.validFrom.toISOString().slice(0, 10) > today;
                const daysUntilExpiry = Math.ceil(
                  (new Date(
                    `${policy.validUntil.toISOString().slice(0, 10)}T00:00:00Z`,
                  ).getTime() -
                    new Date(`${today}T00:00:00Z`).getTime()) /
                    (24 * 60 * 60 * 1000),
                );
                const expiringSoon =
                  !expired && !startsLater && daysUntilExpiry <= 30;
                return (
                  <li
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    key={policy.id}
                  >
                    <div className="min-w-0">
                      <Link
                        className="font-semibold text-slate-900 hover:text-teal-800"
                        href={`/clinic/${membership.clinicId}/patients/${policy.patientId}`}
                      >
                        {policy.patient.fullName}
                      </Link>
                      <p className="mt-1 text-sm text-slate-600">
                        {policy.provider.name} ·{" "}
                        {maskPolicyIdentifier(policy.policyNumber)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {dateFormatter.format(policy.validFrom)} –{" "}
                        {dateFormatter.format(policy.validUntil)}
                        {policy.coverageLimit
                          ? ` · Limit ${amountFormatter.format(Number(policy.coverageLimit))}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                        expired
                          ? "bg-red-50 text-red-800"
                          : startsLater
                            ? "bg-blue-50 text-blue-800"
                            : expiringSoon
                              ? "bg-amber-50 text-amber-800"
                              : "bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {expired
                        ? "Expired"
                        : startsLater
                          ? "Upcoming"
                          : expiringSoon
                            ? "Expiring soon"
                            : "Current"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {pagination.totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
              <p className="text-sm text-slate-500">
                {pagination.totalCount.toLocaleString("en-IN")} policies · Page{" "}
                {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                {pagination.hasPreviousPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={pageHref(pagination.page - 1)}
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Previous
                  </Link>
                )}
                {pagination.hasNextPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={pageHref(pagination.page + 1)}
                  >
                    Next
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
