import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  CreditCard,
  MessageCircle,
  Search,
} from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { ClinicSetupChecklist } from "@/features/onboarding/components/clinic-setup-checklist";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";
import { RecallControls } from "@/features/recalls/components/recall-controls";
import { TreatmentVisitControls } from "@/features/treatments/components/treatment-visit-controls";
import { countClinicAppointments } from "@/features/appointments/lib/appointment-repository";
import { WhatsAppReminder } from "@/features/messages/components/whatsapp-reminder";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/features/messages/lib/template-validation";
import { getClinicWhatsAppTemplate } from "@/features/messages/lib/template-repository";
import { getClinicTreatmentFinanceSummary } from "@/features/treatments/lib/treatment-finance";
import {
  getFollowUpSummary,
  listFollowUpQueue,
} from "@/features/follow-ups/lib/follow-up-repository";
import {
  followUpSearchSchema,
  followUpTabs,
  formatFollowUpPhone,
  getClinicToday,
  getFollowUpStatusLabel,
  getFollowUpTabLabel,
  getFollowUpTreatmentLabel,
  isOverdueOnClinicDate,
} from "@/features/follow-ups/lib/follow-up-validation";

export const dynamic = "force-dynamic";

type ClinicDashboardPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: { tab?: string; q?: string; page?: string };
}>;

const tabIcons = {
  "due-today": CalendarClock,
  overdue: CircleAlert,
  "reminder-sent": MessageCircle,
  confirmed: CalendarCheck2,
  "no-response": CircleAlert,
  completed: CheckCircle2,
} as const;

const tabDescriptions = {
  "due-today":
    "Active visits and recalls scheduled for today, regardless of reminder or response status.",
  overdue:
    "Active visits and recalls with a due date before today. Cancelled, paused and completed records are excluded.",
  "reminder-sent":
    "Treatment visits marked REMINDER_SENT and active recalls with a manually reported sent-message log. WhatsApp delivery is not verified.",
  confirmed:
    "Treatment visits whose current status is CONFIRMED. Recalls do not have a confirmation status.",
  "no-response":
    "Treatment visits whose current status is NO_RESPONSE. Recalls do not have a response status.",
  completed:
    "Completed treatment visits and recalls. Cancelled records are excluded.",
} as const;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

export default async function ClinicDashboardPage({
  params,
  searchParams,
}: ClinicDashboardPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { name: true, phoneNumber: true },
  });
  if (!clinic) notFound();

  const parsed = followUpSearchSchema.safeParse(searchParams);
  const tab = parsed.success ? parsed.data.tab : "due-today";
  const query = parsed.success ? parsed.data.query : "";
  const page = parsed.success ? parsed.data.page : 1;
  const clinicToday = getClinicToday();
  const [
    queue,
    summary,
    reminderTemplate,
    financialSummary,
    appointmentsToday,
  ] = await Promise.all([
    listFollowUpQueue(membership.clinicId, tab, query, page, clinicToday),
    getFollowUpSummary(membership.clinicId, clinicToday),
    getClinicWhatsAppTemplate(membership.clinicId),
    getClinicTreatmentFinanceSummary(membership.clinicId),
    countClinicAppointments(membership.clinicId, clinicToday),
  ]);
  const { items, pagination } = queue;
  const basePath = `/clinic/${membership.clinicId}`;

  function tabHref(nextTab: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextTab !== "due-today") params.set("tab", nextTab);
    return `${basePath}${params.size ? `?${params.toString()}` : ""}`;
  }

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tab !== "due-today") params.set("tab", tab);
    params.set("page", String(nextPage));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <AppShell clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">
              {membership.role === "OWNER" ? "Clinic owner" : "Clinic staff"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[34px]">
              {clinic.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Today&apos;s follow-up queue ·{" "}
              {dateFormatter.format(new Date(`${clinicToday}T00:00:00.000Z`))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={`/clinic/${membership.clinicId}/patients`}
            >
              Patient directory
            </Link>
            {membership.role === "OWNER" && (
              <>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  href={`/clinic/${membership.clinicId}/settings/team`}
                >
                  Manage team
                </Link>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                  href={`/clinic/${membership.clinicId}/billing`}
                >
                  <CreditCard aria-hidden="true" className="size-4" />
                  Billing
                </Link>
              </>
            )}
          </div>
        </header>

        {membership.role === "OWNER" && (
          <ClinicSetupChecklist clinicId={membership.clinicId} />
        )}

        <section
          aria-label="Follow-up summary"
          className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          {followUpTabs.map((summaryTab) => {
            const Icon = tabIcons[summaryTab];
            return (
              <Link
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow"
                href={tabHref(summaryTab)}
                key={summaryTab}
              >
                <span className="flex items-center justify-between gap-2 text-slate-500">
                  <span className="text-xs font-medium leading-4">
                    {getFollowUpTabLabel(summaryTab)}
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-teal-700"
                  />
                </span>
                <span className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900">
                  {summary[summaryTab]}
                </span>
              </Link>
            );
          })}
        </section>

        <Link
          className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200"
          href={`/clinic/${membership.clinicId}/appointments`}
        >
          <span>
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Appointments today
            </span>
            <span className="mt-1 block text-2xl font-semibold text-slate-900">
              {appointmentsToday}
            </span>
          </span>
          <span className="text-sm font-medium text-teal-800">
            Open schedule →
          </span>
        </Link>

        <section
          aria-label="Treatment finance summary"
          className="mt-6 grid gap-3 sm:grid-cols-2"
        >
          <Link
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200"
            href={`/clinic/${membership.clinicId}/treatments/catalogue`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Payments collected this month
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 2,
              }).format(financialSummary.collectionsThisMonth)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Treatment payments recorded · Manage treatment catalogue
            </p>
          </Link>
          <Link
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200"
            href={`/clinic/${membership.clinicId}/treatments/catalogue`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Outstanding treatment balances
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 2,
              }).format(financialSummary.outstanding)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Based on saved plans, discounts, payments and refunds
            </p>
          </Link>
        </section>

        <section className="mt-8" id="follow-up-queue">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Follow-up queue
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                {tabDescriptions[tab]}
              </p>
            </div>
          </div>

          <nav
            aria-label="Follow-up tabs"
            className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1"
          >
            {followUpTabs.map((value) => (
              <Link
                aria-current={tab === value ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                  tab === value
                    ? "bg-teal-100 text-teal-900"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                href={tabHref(value)}
                key={value}
              >
                {getFollowUpTabLabel(value)}
                <span className="ml-2 rounded-full bg-white/70 px-1.5 py-0.5 text-xs">
                  {summary[value]}
                </span>
              </Link>
            ))}
          </nav>

          <form
            action={basePath}
            className="my-4 flex flex-col gap-2 sm:flex-row"
            role="search"
          >
            <input name="tab" type="hidden" value={tab} />
            <label className="sr-only" htmlFor="follow-up-search">
              Search by patient, phone or treatment
            </label>
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={query}
                id="follow-up-search"
                maxLength={100}
                name="q"
                placeholder="Search patient, phone or treatment"
                type="search"
              />
            </div>
            <button
              className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium hover:bg-slate-50"
              type="submit"
            >
              Search
            </button>
          </form>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                <ClipboardCheck aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {query
                  ? "No matching follow-ups"
                  : `No ${getFollowUpTabLabel(tab).toLowerCase()} follow-ups`}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {query
                  ? "Try another patient name, phone number or treatment."
                  : "There are no records in this queue right now. Cancelled and paused records are not included in active follow-ups."}
              </p>
            </div>
          ) : (
            <section
              aria-label={`${getFollowUpTabLabel(tab)} follow-ups`}
              className="space-y-3"
            >
              {items.map((item) => {
                const detailHref =
                  item.kind === "treatment-visit"
                    ? `${basePath}/patients/${item.patientId}/treatments/${item.treatmentPlanId}`
                    : `${basePath}/recalls/${item.id}`;
                const overdue =
                  tab !== "completed" &&
                  isOverdueOnClinicDate(item.dueDate, clinicToday);
                return (
                  <article
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
                    key={`${item.kind}:${item.id}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="text-base font-semibold text-slate-900 hover:text-teal-800"
                            href={`${basePath}/patients/${item.patientId}`}
                          >
                            {item.patientName}
                          </Link>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              overdue
                                ? "bg-red-50 text-red-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {overdue ? "Overdue" : getFollowUpStatusLabel(item)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatFollowUpPhone(item.phoneNumber)}
                        </p>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Treatment / recall
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-slate-800">
                              {getFollowUpTreatmentLabel(item)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Due date
                            </dt>
                            <dd className="mt-1 text-sm text-slate-800">
                              {dateFormatter.format(item.dueDate)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Status
                            </dt>
                            <dd className="mt-1 text-sm text-slate-800">
                              {getFollowUpStatusLabel(item)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <Link
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        href={detailHref}
                      >
                        View details
                      </Link>
                    </div>
                    {item.kind === "treatment-visit" &&
                      item.status !== "COMPLETED" &&
                      item.status !== "CANCELLED" &&
                      item.treatmentPlanId && (
                        <TreatmentVisitControls
                          clinicId={membership.clinicId}
                          dueDate={item.dueDate}
                          patientId={item.patientId}
                          status={item.status}
                          treatmentPlanId={item.treatmentPlanId}
                          visitId={item.id}
                        />
                      )}
                    {item.kind === "preventive-recall" &&
                      item.status === "ACTIVE" && (
                        <RecallControls
                          clinicId={membership.clinicId}
                          dateValue={item.dueDate.toISOString().slice(0, 10)}
                          recallId={item.id}
                          status={item.status}
                        />
                      )}
                    {item.kind === "treatment-visit" &&
                      item.status !== "COMPLETED" &&
                      item.status !== "CANCELLED" && (
                        <WhatsAppReminder
                          clinicId={membership.clinicId}
                          clinicName={clinic.name}
                          clinicPhone={clinic.phoneNumber ?? ""}
                          patientName={item.patientName}
                          patientPhone={item.phoneNumber}
                          hasWhatsAppConsent={
                            item.whatsappOptIn &&
                            item.whatsappOptedInAt !== null
                          }
                          kind="treatment-visit"
                          relatedRecordId={item.id}
                          dueDate={dateFormatter.format(item.dueDate)}
                          treatmentName={item.label}
                          visitNumber={item.visitNumber}
                          totalVisits={item.totalVisits}
                          templateId={reminderTemplate?.id ?? null}
                          templateContent={
                            reminderTemplate?.content ??
                            DEFAULT_WHATSAPP_TEMPLATE
                          }
                          clientRequestId={randomUUID()}
                        />
                      )}
                    {item.kind === "preventive-recall" &&
                      item.status === "ACTIVE" && (
                        <WhatsAppReminder
                          clinicId={membership.clinicId}
                          clinicName={clinic.name}
                          clinicPhone={clinic.phoneNumber ?? ""}
                          patientName={item.patientName}
                          patientPhone={item.phoneNumber}
                          hasWhatsAppConsent={
                            item.whatsappOptIn &&
                            item.whatsappOptedInAt !== null
                          }
                          kind="preventive-recall"
                          relatedRecordId={item.id}
                          dueDate={dateFormatter.format(item.dueDate)}
                          treatmentName={null}
                          visitNumber={null}
                          totalVisits={null}
                          templateId={reminderTemplate?.id ?? null}
                          templateContent={
                            reminderTemplate?.content ??
                            DEFAULT_WHATSAPP_TEMPLATE
                          }
                          clientRequestId={randomUUID()}
                        />
                      )}
                  </article>
                );
              })}
            </section>
          )}

          {items.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-sm text-slate-500">
                {pagination.totalCount} record
                {pagination.totalCount === 1 ? "" : "s"} · Page{" "}
                {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                {pagination.hasPreviousPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-slate-50"
                    href={pageHref(pagination.page - 1)}
                  >
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Previous
                  </Link>
                )}
                {pagination.hasNextPage && (
                  <Link
                    className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-slate-50"
                    href={pageHref(pagination.page + 1)}
                  >
                    Next
                    <ChevronRight aria-hidden="true" className="size-4" />
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
