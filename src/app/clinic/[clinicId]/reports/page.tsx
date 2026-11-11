import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CalendarDays,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { getClinicReportMetrics } from "@/features/reports/lib/report-repository";
import { getClinicTreatmentFinanceSummary } from "@/features/treatments/lib/treatment-finance";
import {
  formatReportDateRange,
  getClinicReportDateRange,
} from "@/features/reports/lib/report-validation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type ClinicReportsPageProps = Readonly<{
  params: { clinicId: string };
}>;

export default async function ClinicReportsPage({
  params,
}: ClinicReportsPageProps) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(parsedClinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, timeZone: true },
  });
  if (!clinic) notFound();

  const range = getClinicReportDateRange(new Date(), clinic.timeZone);
  const [metrics, financialSummary] = await Promise.all([
    getClinicReportMetrics(membership.clinicId, range),
    getClinicTreatmentFinanceSummary(membership.clinicId),
  ]);
  const displayedRange = formatReportDateRange(range);

  const cards = [
    {
      label: "Active patients",
      value: metrics.activePatients,
      description: "Patient records currently in this clinic.",
      icon: UsersRound,
      tone: "teal",
    },
    {
      label: "Appointments",
      value: metrics.appointments,
      description:
        "Scheduled, confirmed or completed appointments in this date range.",
      icon: CalendarDays,
      tone: "blue",
    },
    {
      label: "Pending treatment visits",
      value: metrics.pendingTreatmentVisits,
      description: "Pending or rescheduled visits due today or later.",
      icon: CalendarClock,
      tone: "blue",
    },
    {
      label: "Overdue treatment visits",
      value: metrics.overdueTreatmentVisits,
      description: "Unresolved visits due before today.",
      icon: CircleAlert,
      tone: "amber",
    },
    {
      label: "Pending preventive recalls",
      value: metrics.pendingPreventiveRecalls,
      description: "Active recalls due today or later.",
      icon: CalendarClock,
      tone: "blue",
    },
    {
      label: "Overdue preventive recalls",
      value: metrics.overduePreventiveRecalls,
      description: "Active recalls due before today.",
      icon: CircleAlert,
      tone: "amber",
    },
    {
      label: "Manually recorded WhatsApp messages",
      value: metrics.manuallyRecordedWhatsAppMessages,
      description:
        "Member-reported sends in the displayed date range; not WhatsApp-verified.",
      icon: MessageCircle,
      tone: "teal",
    },
    {
      label: "Confirmed follow-ups",
      value: metrics.confirmedFollowUps,
      description:
        "Confirmed treatment visits with due dates in the displayed range.",
      icon: CalendarCheck2,
      tone: "blue",
    },
    {
      label: "Completed treatment plans",
      value: metrics.completedTreatmentPlans,
      description:
        "Plans fully completed in the displayed range; not visit counts.",
      icon: CheckCircle2,
      tone: "green",
    },
  ] as const;

  const toneClasses = {
    teal: "bg-teal-50 text-teal-800",
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    green: "bg-emerald-50 text-emerald-800",
  } as const;

  return (
    <AppShell activeSection="reports" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={`/clinic/${membership.clinicId}`}
        >
          ← Back to dashboard
        </Link>
        <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">{clinic.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Clinic reports
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Current workload and clinic activity at a glance.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <p className="font-medium text-slate-800">{displayedRange}</p>
            <p className="mt-1 text-xs text-slate-500">
              Activity range · {range.timeZone}
            </p>
          </div>
        </header>

        <section
          aria-label="Clinic report metrics"
          className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {cards.map(({ label, value, description, icon: Icon, tone }) => (
            <article
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              key={label}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium leading-5 text-slate-600">
                  {label}
                </h2>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${toneClasses[tone]}`}
                >
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                {value.toLocaleString("en-IN")}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {description}
              </p>
            </article>
          ))}
        </section>

        <section aria-label="Financial overview" className="mt-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Financial overview
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Live treatment ledger figures for this clinic. Collections are for the
              current calendar month; outstanding balances are the current open
              balance.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Payments collected this month
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald-700">
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2,
                }).format(financialSummary.collectionsThisMonth)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Recorded treatment payments. Refunds are tracked separately.
              </p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Outstanding treatment balances
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-amber-700">
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 2,
                }).format(financialSummary.outstanding)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Remaining balances after recorded discounts, payments and refunds.
              </p>
            </article>
          </div>
        </section>

        {Object.values(metrics).every((value) => value === 0) && (
          <p className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            No clinic activity was found for these metrics yet. New patient,
            visit, recall and follow-up activity will appear here.
          </p>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">
            How to read these reports
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Workload metrics are a current snapshot as of{" "}
            {displayedRange.split(" – ")[1]} in {range.timeZone}. Activity
            metrics use the full displayed 30-day range. Visit counts and
            completed treatment-plan counts are separate: completing every visit
            completes one treatment plan.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
