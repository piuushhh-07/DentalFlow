import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { formatIndianPhoneNumber } from "@/features/patients/lib/patient-validation";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { PolicyForm } from "@/features/insurance/components/policy-form";
import {
  listInsurancePatients,
  listInsuranceProviders,
} from "@/features/insurance/lib/insurance-repository";

export const dynamic = "force-dynamic";

type NewInsurancePolicyPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    patientId?: string;
    query?: string;
    error?: string;
  };
}>;

export default async function NewInsurancePolicyPage({
  params,
  searchParams,
}: NewInsurancePolicyPageProps) {
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
  const basePath = `/clinic/${membership.clinicId}/insurance/policies/new`;
  const selectedPatient = searchParams.patientId
    ? z.string().uuid().safeParse(searchParams.patientId)
    : undefined;
  if (selectedPatient && !selectedPatient.success) notFound();

  let patient;
  let providers: Awaited<ReturnType<typeof listInsuranceProviders>> | undefined;
  if (selectedPatient?.success) {
    const patients = await listInsurancePatients(
      membership.clinicId,
      "",
      selectedPatient.data,
    );
    patient = patients[0];
    if (!patient) notFound();
    providers = (await listInsuranceProviders(membership.clinicId)).filter(
      (provider) => !provider.archivedAt,
    );
  }

  if (patient && providers) {
    return (
      <AppShell activeSection="insurance" clinicId={membership.clinicId}>
        <div className="mx-auto max-w-3xl">
          <Link
            className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
            href={`/clinic/${membership.clinicId}/insurance/policies`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to policies
          </Link>
          <div className="mb-5 mt-5">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Add patient policy
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Policy details are clinic-scoped and identifiers are masked in
              list summaries.
            </p>
          </div>
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Policies"
          />
          {searchParams.error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The policy could not be saved. Verify the details and try again.
            </p>
          )}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <PolicyForm
              clinicId={membership.clinicId}
              patientId={patient.id}
              patientName={patient.fullName}
              providers={providers}
            />
          </section>
        </div>
      </AppShell>
    );
  }

  const query = (searchParams.query ?? "").trim().slice(0, 100);
  const patients = await listInsurancePatients(membership.clinicId, query);
  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}/insurance/policies`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to policies
        </Link>
        <div className="mb-5 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Choose a patient
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Select an existing patient in this clinic.
          </p>
        </div>
        <InsuranceNavigation
          clinicId={membership.clinicId}
          current="Policies"
        />
        <form action={basePath} className="mb-4 flex gap-2" role="search">
          <label className="relative block flex-1">
            <span className="sr-only">Search patients</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm"
              defaultValue={query}
              maxLength={100}
              name="query"
              placeholder="Search patient name or phone"
              type="search"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {patients.length ? (
            <ul className="divide-y divide-slate-100">
              {patients.map((row) => (
                <li key={row.id}>
                  <Link
                    className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6"
                    href={`${basePath}?patientId=${row.id}`}
                  >
                    <span>
                      <span className="block font-semibold text-slate-900">
                        {row.fullName}
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {formatIndianPhoneNumber(row.phoneNumber)}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-teal-800">
                      Select →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-14 text-center text-sm text-slate-600">
              {query
                ? "No patients match your search."
                : "Add a patient before creating a policy."}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
