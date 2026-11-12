import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Search, UsersRound } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  formatIndianPhoneNumber,
  patientSearchSchema,
} from "@/features/patients/lib/patient-validation";
import { listClinicPatients } from "@/features/patients/lib/patient-repository";
import { measureServerOperation } from "@/lib/performance/server-timing";

type PatientListPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    q?: string;
    page?: string;
    created?: string;
    updated?: string;
    deleted?: string;
  };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export default async function PatientListPage({
  params,
  searchParams,
}: PatientListPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);

  if (!clinicId.success) {
    notFound();
  }

  let membership;

  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) {
      notFound();
    }

    throw error;
  }

  const parsedSearch = patientSearchSchema.safeParse({
    query: searchParams.q,
    page: searchParams.page,
  });
  const query = parsedSearch.success ? parsedSearch.data.query : "";
  const requestedPage = parsedSearch.success ? parsedSearch.data.page : 1;
  const { patients, pagination } = await measureServerOperation("patients.directory_query", () => listClinicPatients(membership.clinicId, query, requestedPage));
  const basePath = `/clinic/${membership.clinicId}/patients`;

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">
              Clinic workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Patients
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              A clinic-scoped directory for ongoing care and follow-ups.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href={`${basePath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add patient
          </Link>
        </div>

        <form
          action={basePath}
          className="my-6 flex flex-col gap-2 sm:flex-row"
          role="search"
        >
          <label className="sr-only" htmlFor="patient-search">
            Search patients by name or phone
          </label>
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={query}
              id="patient-search"
              maxLength={100}
              name="q"
              placeholder="Search name or phone number"
              type="search"
            />
          </div>
          <Button variant="outline" type="submit">
            Search
          </Button>
        </form>

        <section
          aria-label="Patient results"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {patients.length === 0 ? (
            <div className="px-6 py-16 text-center sm:py-20">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                <UsersRound aria-hidden="true" className="size-6" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {query ? "No matching patients" : "Your patient list is empty"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {query
                  ? "Try another name or phone number, or clear your search."
                  : "Add your first patient to start keeping treatment follow-ups and preventive care organized."}
              </p>
              {query ? (
                <Link
                  className="mt-5 inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-teal-800 hover:bg-teal-50"
                  href={basePath}
                >
                  Clear search
                </Link>
              ) : (
                <Link
                  className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href={`${basePath}/new`}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add patient
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3.5" scope="col">
                        Patient
                      </th>
                      <th className="px-5 py-3.5" scope="col">
                        Phone
                      </th>
                      <th className="px-5 py-3.5" scope="col">
                        WhatsApp consent
                      </th>
                      <th className="px-5 py-3.5" scope="col">
                        Added
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patients.map((patient) => (
                      <tr
                        className="transition-colors hover:bg-slate-50/70"
                        key={patient.id}
                      >
                        <td className="px-5 py-4">
                          <Link
                            className="font-semibold text-slate-900 hover:text-teal-800"
                            href={`${basePath}/${patient.id}`}
                          >
                            {patient.fullName}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatIndianPhoneNumber(patient.phoneNumber)}
                        </td>
                        <td className="px-5 py-4">
                          <ConsentBadge optedIn={patient.whatsappOptIn} />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {dateFormatter.format(patient.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-slate-100 md:hidden">
                {patients.map((patient) => (
                  <li className="p-4" key={patient.id}>
                    <Link
                      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      href={`${basePath}/${patient.id}`}
                    >
                      <span className="block font-semibold text-slate-900">
                        {patient.fullName}
                      </span>
                      <span className="mt-1 block text-sm text-slate-600">
                        {formatIndianPhoneNumber(patient.phoneNumber)}
                      </span>
                      <span className="mt-2 inline-flex">
                        <ConsentBadge optedIn={patient.whatsappOptIn} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {pagination.totalCount > 0 && (
          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {pagination.skip + 1}–
              {Math.min(
                pagination.skip + patients.length,
                pagination.totalCount,
              )}{" "}
              of {pagination.totalCount} patients
            </p>
            <nav aria-label="Patient list pages" className="flex gap-2">
              {pagination.hasPreviousPage ? (
                <PageLink
                  href={pageHref(basePath, query, pagination.page - 1)}
                  label="Previous"
                />
              ) : (
                <span className="rounded-md border border-slate-200 px-3 py-2 text-slate-400">
                  Previous
                </span>
              )}
              <span
                aria-current="page"
                className="rounded-md bg-teal-50 px-3 py-2 font-medium text-teal-800"
              >
                {pagination.page} / {pagination.totalPages}
              </span>
              {pagination.hasNextPage ? (
                <PageLink
                  href={pageHref(basePath, query, pagination.page + 1)}
                  label="Next"
                />
              ) : (
                <span className="rounded-md border border-slate-200 px-3 py-2 text-slate-400">
                  Next
                </span>
              )}
            </nav>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ConsentBadge({ optedIn }: Readonly<{ optedIn: boolean }>) {
  return (
    <span
      className={
        optedIn
          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
          : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
      }
    >
      {optedIn ? "Opted in" : "Not opted in"}
    </span>
  );
}

function PageLink({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <Link
      className="rounded-md border border-slate-200 px-3 py-2 font-medium text-slate-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      {label}
    </Link>
  );
}

function pageHref(basePath: string, query: string, page: number): string {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}
