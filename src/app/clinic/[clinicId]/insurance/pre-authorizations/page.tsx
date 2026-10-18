import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { listInsurancePreAuthorizationsPage } from "@/features/insurance/lib/insurance-repository";

export const dynamic = "force-dynamic";

const amountFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

type PreAuthorizationsPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    query?: string;
    created?: string;
    updated?: string;
    page?: string;
  };
}>;

export default async function PreAuthorizationsPage({
  params,
  searchParams,
}: PreAuthorizationsPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
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
  const { requests, pagination } = await listInsurancePreAuthorizationsPage(
    membership.clinicId,
    query,
    requestedPage,
  );
  const basePath = `/clinic/${membership.clinicId}/insurance/pre-authorizations`;
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
              Cashless pre-authorizations
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track estimates, requests and explicit insurer decisions.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href={`${basePath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            New request
          </Link>
        </header>
        <div className="mt-6">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Pre-authorizations"
          />
        </div>
        {pagination.totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-sm text-slate-500">
              {pagination.totalCount.toLocaleString("en-IN")} requests · Page{" "}
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
        <form action={basePath} className="mb-5 flex gap-2" role="search">
          <label className="relative block flex-1">
            <span className="sr-only">Search pre-authorizations</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm"
              defaultValue={query}
              maxLength={100}
              name="query"
              placeholder="Search patient, provider or reference"
              type="search"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {requests.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h2 className="font-semibold text-slate-900">
                {query ? "No matching requests" : "No pre-authorizations yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Add a draft request to track the proposed treatment and
                estimate.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    className="flex flex-col gap-3 px-4 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    href={`${basePath}/${request.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">
                        {request.patient.fullName}
                      </span>
                      <span className="mt-1 block truncate text-sm text-slate-500">
                        {request.policy.provider.name} ·{" "}
                        {request.proposedTreatment}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-800">
                        {amountFormatter.format(Number(request.estimatedCost))}
                      </span>
                      {request.approvedAmount && (
                        <span className="text-xs text-slate-600">
                          Approved{" "}
                          {amountFormatter.format(
                            Number(request.approvedAmount),
                          )}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {request.status.replaceAll("_", " ")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {dateFormatter.format(request.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
