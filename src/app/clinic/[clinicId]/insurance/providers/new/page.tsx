import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { ProviderForm } from "@/features/insurance/components/provider-form";

export const dynamic = "force-dynamic";

export default async function NewInsuranceProviderPage({
  params,
  searchParams,
}: Readonly<{
  params: { clinicId: string };
  searchParams: { error?: string };
}>) {
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
  return (
    <AppShell activeSection="insurance" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-3xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}/insurance/providers`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to providers
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Add insurance provider
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Save clinic-specific contact details and claim guidance.
          </p>
        </div>
        <div className="mb-5">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Providers"
          />
          {searchParams.error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The provider could not be saved. Check the details and try again.
            </p>
          )}
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <ProviderForm clinicId={membership.clinicId} />
        </section>
      </div>
    </AppShell>
  );
}
