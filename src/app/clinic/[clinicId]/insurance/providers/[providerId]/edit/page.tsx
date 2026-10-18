import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { InsuranceNavigation } from "@/features/insurance/components/insurance-navigation";
import { ProviderForm } from "@/features/insurance/components/provider-form";
import { getInsuranceProvider } from "@/features/insurance/lib/insurance-repository";

export const dynamic = "force-dynamic";

export default async function EditInsuranceProviderPage({
  params,
}: Readonly<{ params: { clinicId: string; providerId: string } }>) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const providerId = z.string().uuid().safeParse(params.providerId);
  if (!clinicId.success || !providerId.success) notFound();
  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const provider = await getInsuranceProvider(
    membership.clinicId,
    providerId.data,
  );
  if (!provider || provider.archivedAt) notFound();

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
            Edit {provider.name}
          </h1>
        </div>
        <div className="mb-5">
          <InsuranceNavigation
            clinicId={membership.clinicId}
            current="Providers"
          />
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <ProviderForm
            clinicId={membership.clinicId}
            provider={{
              ...provider,
              kind: provider.kind,
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
