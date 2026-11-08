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
import { ClaimForm } from "@/features/insurance/components/claim-form";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import {
  listInsurancePatients,
  listInsurancePlansForPatient,
  listInsurancePolicies,
  listInsurancePreAuthorizations,
} from "@/features/insurance/lib/insurance-repository";

export const dynamic = "force-dynamic";

type NewInsuranceClaimPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: { patientId?: string; query?: string; error?: string };
}>;

export default async function NewInsuranceClaimPage({
  params,
  searchParams,
}: NewInsuranceClaimPageProps) {
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
  const basePath = `/clinic/${membership.clinicId}/insurance/claims/new`;
  const selectedPatient = searchParams.patientId
    ? z.string().uuid().safeParse(searchParams.patientId)
    : undefined;
  if (selectedPatient && !selectedPatient.success) notFound();

  if (selectedPatient?.success) {
    const patients = await listInsurancePatients(
      membership.clinicId,
      "",
      selectedPatient.data,
    );
    const patient = patients[0];
    if (!patient) notFound();
    const [policies, plans, preAuthorizations] = await Promise.all([
      listInsurancePolicies(membership.clinicId, "", patient.id),
      listInsurancePlansForPatient(membership.clinicId, patient.id),
      listInsurancePreAuthorizations(membership.clinicId, "", patient.id),
    ]);
    const approvedRequests = preAuthorizations.filter(
      (request) =>
        request.status === "APPROVED" ||
        request.status === "PARTIALLY_APPROVED",
    );

    return (
      <AppShell activeSection="insurance" clinicId={membership.clinicId}>
        <div className="mx-auto max-w-3xl">
          <Link
            className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
            href={`/clinic/${membership.clinicId}/insurance/claims`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to claims
          </Link>
          <div className="mb-5 mt-5">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Create insurance claim
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Start a cashless or reimbursement workflow for an existing
              patient.
            </p>
          </div>
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Claims"
          />
          {searchParams.error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The claim could not be saved. Check policy validity and linked
              records, then try again.
            </p>
          )}
          {policies.length === 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-950">
                This patient has no policy recorded
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Add a policy before creating an insurance claim.
              </p>
              <Link
                className="mt-4 inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                href={`/clinic/${membership.clinicId}/insurance/policies/new?patientId=${patient.id}`}
              >
                Add patient policy
              </Link>
            </section>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <ClaimForm
                clinicId={membership.clinicId}
                patient={patient}
                policies={policies}
                plans={plans}
                preAuthorizations={approvedRequests}
              />
            </section>
          )}
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
          href={`/clinic/${membership.clinicId}/insurance/claims`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to claims
        </Link>
        <div className="mb-5 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Choose a patient
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Select a clinic patient to start a new claim.
          </p>
        </div>
        <InsuranceNavigation clinicId={membership.clinicId} current="Claims" />
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
              {patients.map((patient) => (
                <li key={patient.id}>
                  <Link
                    className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-6"
                    href={`${basePath}?patientId=${patient.id}`}
                  >
                    <span>
                      <span className="block font-semibold text-slate-900">
                        {patient.fullName}
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {formatIndianPhoneNumber(patient.phoneNumber)}
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
                : "Add a patient before creating a claim."}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
