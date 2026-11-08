import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { ArchiveProviderForm } from "@/features/insurance/components/archive-provider-form";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { listInsuranceProvidersPage } from "@/features/insurance/lib/insurance-repository";

export const dynamic = "force-dynamic";

type InsuranceProvidersPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    query?: string;
    created?: string;
    updated?: string;
    archived?: string;
    error?: string;
    page?: string;
  };
}>;

export default async function InsuranceProvidersPage({
  params,
  searchParams,
}: InsuranceProvidersPageProps) {
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
  const { providers, pagination } = await listInsuranceProvidersPage(
    membership.clinicId,
    query,
    requestedPage,
  );
  const basePath = `/clinic/${membership.clinicId}/insurance/providers`;
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
              Providers
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Keep insurer and TPA contact details and claim instructions.
            </p>
          </div>
          {membership.role === "OWNER" && (
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href={`${basePath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add provider
          </Link>
          )}
        </header>
        <div className="mt-6">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Providers"
          />
        </div>
        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            The provider could not be saved. Check the details and try again.
          </p>
        )}
        <form action={basePath} className="mb-5 flex gap-2" role="search">
          <label className="relative block flex-1">
            <span className="sr-only">Search providers</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={query}
              maxLength={100}
              name="query"
              placeholder="Search organization name"
              type="search"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {providers.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-slate-600">
              {query
                ? "No providers match your search."
                : "No insurance providers have been added yet."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {providers.map((provider) => (
                <li
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  key={provider.id}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {provider.name}
                      {provider.archivedAt && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                          Archived
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {provider.kind === "TPA"
                        ? "TPA"
                        : provider.kind === "BOTH"
                          ? "Insurer and TPA"
                          : "Insurer"}
                      {provider.phoneNumber ? ` · ${provider.phoneNumber}` : ""}
                      {provider.email ? ` · ${provider.email}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {provider._count.policies} linked{" "}
                      {provider._count.policies === 1 ? "policy" : "policies"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {membership.role === "OWNER" && !provider.archivedAt && (
                      <>
                        <Link
                          className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-slate-50"
                          href={`${basePath}/${provider.id}/edit`}
                        >
                          Edit
                        </Link>
                        <ArchiveProviderForm
                          clinicId={membership.clinicId}
                          providerId={provider.id}
                        />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pagination.totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
              <p className="text-sm text-slate-500">
                {pagination.totalCount.toLocaleString("en-IN")} providers · Page{" "}
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
