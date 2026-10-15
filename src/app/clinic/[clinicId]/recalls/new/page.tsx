import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { getClinicPatient } from "@/features/patients/lib/patient-repository";
import { RecallForm } from "@/features/recalls/components/recall-form";
import { listClinicRecallPatients } from "@/features/recalls/lib/recall-repository";
import { formatIndianPhoneNumber } from "@/features/patients/lib/patient-validation";

export const dynamic = "force-dynamic";

type NewRecallPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: { patientId?: string; q?: string; page?: string };
}>;

export default async function NewRecallPage({
  params,
  searchParams,
}: NewRecallPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const basePath = `/clinic/${membership.clinicId}/recalls/new`;
  const patientId = z.string().uuid().safeParse(searchParams.patientId);
  if (searchParams.patientId && !patientId.success) notFound();

  if (patientId.success) {
    const patient = await getClinicPatient(membership.clinicId, patientId.data);
    if (!patient) notFound();

    return (
      <AppShell activeSection="recalls" clinicId={membership.clinicId}>
        <div className="mx-auto max-w-2xl">
          <Link
            className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800"
            href={`/clinic/${membership.clinicId}/recalls`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to recalls
          </Link>
          <div className="mb-6 mt-5">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Create preventive recall
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Schedule a specific future care reminder. No recurring records are
              created automatically.
            </p>
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <RecallForm
              clinicId={membership.clinicId}
              patientId={patient.id}
              patientName={patient.fullName}
            />
          </section>
        </div>
      </AppShell>
    );
  }

  const query = (searchParams.q ?? "").trim().slice(0, 100);
  const page = z.coerce.number().int().min(1).safeParse(searchParams.page);
  const { patients, pagination } = await listClinicRecallPatients(
    membership.clinicId,
    query,
    page.success ? page.data : 1,
  );
  const makeHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    search.set("page", String(nextPage));
    return `${basePath}?${search.toString()}`;
  };

  return (
    <AppShell activeSection="recalls" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}/recalls`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to recalls
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Choose a patient
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Select a patient in this clinic to create a preventive recall.
          </p>
        </div>
        <form action={basePath} className="mb-4 flex gap-2" role="search">
          <label className="sr-only" htmlFor="patient-search">
            Search patients
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
              placeholder="Search patient name"
              type="search"
            />
          </div>
          <button
            className="h-11 rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
            type="submit"
          >
            Search
          </button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {patients.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-600">
              {query
                ? "No patients match your search."
                : "Add a patient before creating a recall."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <Link
                  className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6"
                  href={`${basePath}?patientId=${patient.id}`}
                  key={patient.id}
                >
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {patient.fullName}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {formatIndianPhoneNumber(patient.phoneNumber)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-sm font-medium text-teal-800"
                  >
                    Select →
                  </span>
                </Link>
              ))}
            </div>
          )}
          {patients.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
              <span className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                {pagination.hasPreviousPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={makeHref(pagination.page - 1)}
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />{" "}
                    Previous
                  </Link>
                )}
                {pagination.hasNextPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
                    href={makeHref(pagination.page + 1)}
                  >
                    Next <ChevronRight aria-hidden="true" className="size-4" />
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
