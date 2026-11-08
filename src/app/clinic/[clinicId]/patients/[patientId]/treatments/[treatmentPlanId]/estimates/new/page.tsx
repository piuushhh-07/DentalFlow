import { ClinicPermission } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import { TreatmentEstimateForm } from "@/features/estimates/components/treatment-estimate-form";
import {
  getClinicTreatmentEstimate,
  listClinicEstimateProcedures,
} from "@/features/estimates/lib/estimate-repository";
import { getClinicTreatmentPlan } from "@/features/treatments/lib/treatment-repository";

export const dynamic = "force-dynamic";

type NewTreatmentEstimatePageProps = Readonly<{
  params: { clinicId: string; patientId: string; treatmentPlanId: string };
  searchParams?: { revisionOfEstimateId?: string };
}>;

export default async function NewTreatmentEstimatePage({
  params,
  searchParams,
}: NewTreatmentEstimatePageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);
  const treatmentPlanId = z.string().uuid().safeParse(params.treatmentPlanId);
  const revisionId = searchParams?.revisionOfEstimateId
    ? z.string().uuid().safeParse(searchParams.revisionOfEstimateId)
    : undefined;
  if (
    !clinicId.success ||
    !patientId.success ||
    !treatmentPlanId.success ||
    (revisionId && !revisionId.success)
  ) {
    notFound();
  }

  let membership;
  try {
    membership = await requireClinicPermission(
      clinicId.data,
      ClinicPermission.TREATMENT_PLANS,
    );
    await requireClinicPermission(
      clinicId.data,
      ClinicPermission.FINANCIAL_RECORDS,
    );
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }
  const [plan, catalogue, revisionSource] = await Promise.all([
    getClinicTreatmentPlan(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
    ),
    listClinicEstimateProcedures(membership.clinicId),
    revisionId?.success
      ? getClinicTreatmentEstimate(
          membership.clinicId,
          patientId.data,
          revisionId.data,
        )
      : Promise.resolve(null),
  ]);
  if (
    !plan ||
    plan.status === "CANCELLED" ||
    (revisionId?.success && !revisionSource) ||
    (revisionSource && revisionSource.treatmentPlanId !== plan.id)
  ) {
    notFound();
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const patientPath = `/clinic/${membership.clinicId}/patients/${patientId.data}`;

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`${patientPath}/treatments/${treatmentPlanId.data}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to treatment plan
        </Link>
        <header className="my-5">
          <p className="text-sm font-medium text-teal-700">
            {revisionSource
              ? "Create estimate revision"
              : "New treatment estimate"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {plan.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            For {plan.patient.fullName}. Saving creates an auditable quotation
            snapshot; it does not create a financial charge or payment.
          </p>
        </header>
        <TreatmentEstimateForm
          catalogue={catalogue.map((item) => ({
            ...item,
            defaultPrice: item.defaultPrice?.toFixed(2) ?? null,
          }))}
          clinicId={membership.clinicId}
          patientId={patientId.data}
          patientName={plan.patient.fullName}
          revisionSource={
            revisionSource
              ? {
                  ...revisionSource,
                  discountAmount: revisionSource.discountAmount.toFixed(2),
                  taxRate: revisionSource.taxRate.toFixed(2),
                  lines: revisionSource.lines.map((line) => ({
                    ...line,
                    catalogueItemId:
                      line.catalogueItemId &&
                      catalogue.some((item) => item.id === line.catalogueItemId)
                        ? line.catalogueItemId
                        : null,
                    unitPrice: line.unitPrice.toFixed(2),
                  })),
                }
              : undefined
          }
          today={today}
          treatmentPlanId={plan.id}
          treatmentPlanName={plan.name}
        />
      </div>
    </AppShell>
  );
}
