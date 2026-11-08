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
import { listInsuranceClaims } from "@/features/insurance/lib/insurance-repository";
import {
  claimSearchSchema,
  insuranceClaimStatuses,
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

type InsuranceClaimsPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    query?: string;
    patientId?: string;
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}>;

export default async function InsuranceClaimsPage({
  params,
  searchParams,
}: InsuranceClaimsPageProps) {
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

  const filters = claimSearchSchema.safeParse(searchParams);
  const parsed = filters.success ? filters.data : claimSearchSchema.parse({});
  const { claims, pagination } = await listInsuranceClaims(
    membership.clinicId,
    {
      query: parsed.query,
      patientId: parsed.patientId,
      type: parsed.type,
      status: parsed.status,
      from: parsed.from || undefined,
      to: parsed.to || undefined,
      page: parsed.page,
    },
  );
  const basePath = `/clinic/${membership.clinicId}/insurance/claims`;
  function makeHref(page: number) {
    const query = new URLSearchParams();
    if (parsed.query) query.set("query", parsed.query);
    if (parsed.patientId) query.set("patientId", parsed.patientId);
    if (parsed.type) query.set("type", parsed.type);
    if (parsed.status) query.set("status", parsed.status);
    if (parsed.from) query.set("from", parsed.from);
    if (parsed.to) query.set("to", parsed.to);
    query.set("page", String(page));
    return `${basePath}?${query.toString()}`;
  }

  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Insurance</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Claims
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track cashless and patient reimbursement claims.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href={`${basePath}/new`}
          >
            {parsed.patientId && (
              <input name="patientId" type="hidden" value={parsed.patientId} />
            )}
            <Plus aria-hidden="true" className="size-4" />
            New claim
          </Link>
        </header>

        <div className="mt-6">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Claims"
          />
        </div>

        <form
          action={basePath}
          className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
          role="search"
        >
          <label className="relative block sm:col-span-2 lg:col-span-2">
            <span className="sr-only">Search claims</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={parsed.query}
              maxLength={100}
              name="query"
              placeholder="Patient, provider or reference"
              type="search"
            />
          </label>
          <label className="sr-only" htmlFor="claim-type">
            Claim type
          </label>
          <select
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            defaultValue={parsed.type ?? ""}
            id="claim-type"
            name="type"
          >
            <option value="">All types</option>
            <option value="CASHLESS">Cashless</option>
            <option value="REIMBURSEMENT">Reimbursement</option>
          </select>
          <label className="sr-only" htmlFor="claim-status">
            Claim status
          </label>
          <select
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            defaultValue={parsed.status ?? ""}
            id="claim-status"
            name="status"
          >
            <option value="">All statuses</option>
            {insuranceClaimStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="claim-from">
            Created from
          </label>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            defaultValue={parsed.from}
            id="claim-from"
            name="from"
            type="date"
          />
          <label className="sr-only" htmlFor="claim-to">
            Created until
          </label>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 text-sm"
            defaultValue={parsed.to}
            id="claim-to"
            name="to"
            type="date"
          />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit" variant="outline">
              Search
            </Button>
            <Link
              className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              href={
                parsed.patientId
                  ? `${basePath}?patientId=${parsed.patientId}`
                  : basePath
              }
            >
              Clear filters
            </Link>
          </div>
        </form>

        <section
          aria-label="Insurance claim results"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {claims.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h2 className="font-semibold text-slate-900">
                {parsed.query || parsed.type || parsed.status
                  ? "No matching claims"
                  : "No claims yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Create a claim after checking that the patient policy is valid
                for the treatment date.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link
                    className="flex flex-col gap-3 px-4 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    href={`${basePath}/${claim.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">
                        {claim.patient.fullName}
                      </span>
                      <span className="mt-1 block truncate text-sm text-slate-500">
                        {claim.policy.provider.name} ·{" "}
                        {claim.type.toLowerCase()}
                        {claim.claimReference
                          ? ` · ${claim.claimReference}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-800">
                        {amountFormatter.format(Number(claim.amountClaimed))}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {claim.status.replaceAll("_", " ")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {dateFormatter.format(claim.treatmentDate)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pagination.totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
              <p className="text-sm text-slate-500">
                {pagination.totalCount.toLocaleString("en-IN")} claims · Page{" "}
                {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                {pagination.page > 1 && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={makeHref(pagination.page - 1)}
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Previous
                  </Link>
                )}
                {pagination.page < pagination.totalPages && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={makeHref(pagination.page + 1)}
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
