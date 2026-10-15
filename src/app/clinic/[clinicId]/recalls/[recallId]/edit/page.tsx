import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PreventiveRecallStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { RecallForm } from "@/features/recalls/components/recall-form";
import { getClinicRecall } from "@/features/recalls/lib/recall-repository";
import { toDateInput } from "@/features/recalls/lib/recall-validation";

export const dynamic = "force-dynamic";

type EditRecallPageProps = Readonly<{
  params: { clinicId: string; recallId: string };
}>;

export default async function EditRecallPage({ params }: EditRecallPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const recallId = z.string().uuid().safeParse(params.recallId);
  if (!clinicId.success || !recallId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const recall = await getClinicRecall(membership.clinicId, recallId.data);
  if (!recall || recall.status === PreventiveRecallStatus.COMPLETED) notFound();

  return (
    <AppShell activeSection="recalls" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-2xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}/recalls/${recall.id}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to recall
        </Link>
        <div className="mb-6 mt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Edit recall
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Update the recall cycle, due date or notes.
          </p>
        </div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <RecallForm
            clinicId={membership.clinicId}
            initialCustomName={recall.customName}
            initialDueDate={toDateInput(recall.dueDate)}
            initialIntervalMonths={recall.intervalMonths}
            initialNotes={recall.notes}
            initialType={recall.type}
            patientId={recall.patientId}
            patientName={recall.patient.fullName}
            recallId={recall.id}
          />
        </section>
      </div>
    </AppShell>
  );
}
