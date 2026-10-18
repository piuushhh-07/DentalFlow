import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Pencil } from "lucide-react";
import { PreventiveRecallStatus } from "@prisma/client";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { RecallControls } from "@/features/recalls/components/recall-controls";
import { getClinicRecall } from "@/features/recalls/lib/recall-repository";
import {
  formatRecallDate,
  getClinicToday,
  isRecallOverdue,
  recallStatusLabels,
  recallTypeLabels,
  toDateInput,
} from "@/features/recalls/lib/recall-validation";

export const dynamic = "force-dynamic";

type RecallDetailPageProps = Readonly<{
  params: { clinicId: string; recallId: string };
}>;

export default async function RecallDetailPage({
  params,
}: RecallDetailPageProps) {
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
  if (!recall) notFound();

  const overdue = isRecallOverdue(
    recall.dueDate,
    recall.status,
    getClinicToday(),
  );
  const title =
    recall.type === "CUSTOM"
      ? recall.customName
      : recallTypeLabels[recall.type];

  return (
    <AppShell activeSection="recalls" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-4xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800"
          href={`/clinic/${membership.clinicId}/recalls`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to recalls
        </Link>

        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800">
              <CalendarClock aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-teal-700">
                Preventive recall
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                For {recall.patient.fullName}
              </p>
            </div>
          </div>
          {recall.status !== PreventiveRecallStatus.COMPLETED && (
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-white px-4 text-sm font-medium hover:bg-slate-50"
              href={`/clinic/${membership.clinicId}/recalls/${recall.id}/edit`}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit recall
            </Link>
          )}
        </header>

        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-base font-semibold text-slate-900">
            Recall details
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Patient
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {recall.patient.fullName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Due date
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {formatRecallDate(recall.dueDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {overdue ? "Overdue" : recallStatusLabels[recall.status]}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Repeat interval
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {recall.intervalMonths
                  ? `${recall.intervalMonths} month${recall.intervalMonths === 1 ? "" : "s"}`
                  : "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(recall.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last updated
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Kolkata",
                }).format(recall.updatedAt)}
              </dd>
            </div>
            {recall.completedAt && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Completed
                </dt>
                <dd className="mt-1 text-sm text-slate-800">
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(recall.completedAt)}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {recall.notes || "No notes added."}
            </p>
          </div>
          <RecallControls
            clinicId={membership.clinicId}
            dateValue={toDateInput(recall.dueDate)}
            recallId={recall.id}
            status={recall.status}
          />
        </section>
      </div>
    </AppShell>
  );
}
