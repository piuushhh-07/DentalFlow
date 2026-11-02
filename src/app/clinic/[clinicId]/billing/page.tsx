import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { BillingPortal } from "@/features/billing/components/billing-portal";
import {
  getClinicBillingPortalData,
  listAvailableBillingPlans,
} from "@/features/billing/lib/billing-repository";
import { ClinicRole } from "@prisma/client";

type BillingPageProps = Readonly<{
  params: { clinicId: string };
}>;

export const dynamic = "force-dynamic";

export default async function ClinicBillingPage({ params }: BillingPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (
      error instanceof ClinicAccessDeniedError ||
      error instanceof ClinicRoleDeniedError
    ) {
      notFound();
    }
    throw error;
  }

  const [subscription, plans] = await Promise.all([
    getClinicBillingPortalData(membership.clinicId),
    listAvailableBillingPlans(),
  ]);
  const portalSubscription = subscription
    ? {
        ...subscription,
        checkoutExpired:
          subscription.checkoutExpiresAt !== null &&
          subscription.checkoutExpiresAt <= new Date(),
      }
    : null;

  return (
    <AppShell clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to clinic
        </Link>
        <div className="mb-6 mt-5">
          <p className="text-sm font-semibold text-teal-800">Clinic owner</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Billing
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage the clinic&apos;s DentalFlow subscription and review billing
            records. This is separate from patient invoices and treatment
            payments.
          </p>
        </div>
        <BillingPortal
          clinicId={membership.clinicId}
          plans={plans}
          subscription={portalSubscription}
        />
      </div>
    </AppShell>
  );
}
