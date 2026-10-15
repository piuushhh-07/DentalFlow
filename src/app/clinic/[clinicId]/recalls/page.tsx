import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { listClinicRecalls } from "@/features/recalls/lib/recall-repository";
import {
  formatRecallDate,
  getClinicToday,
  isRecallOverdue,
  recallListQuerySchema,
  recallStatusLabels,
  recallTypeLabels,
} from "@/features/recalls/lib/recall-validation";

export const dynamic = "force-dynamic";

type RecallListPageProps = Readonly<{
  params: { clinicId: string };
  searchParams: {
    q?: string;
    filter?: string;
    page?: string;
    created?: string;
    updated?: string;
  };
}>;

const filters = [
  ["all", "All recalls"],
  ["due", "Due / upcoming"],
  ["overdue", "Overdue"],
  ["completed", "Completed"],
  ["paused", "Paused"],
  ["cancelled", "Cancelled"],
] as const;

export default async function RecallListPage({
  params,
  searchParams,
}: RecallListPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const parsed = recallListQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data.query : "";
  const filter = parsed.success ? parsed.data.filter : "all";
  const page = parsed.success ? parsed.data.page : 1;
  const { recalls, pagination } = await listClinicRecalls(
    membership.clinicId,
    query,
    filter,
    page,
  );
  const basePath = `/clinic/${membership.clinicId}/recalls`;
  const today = getClinicToday();

  function filterHref(nextFilter: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextFilter !== "all") params.set("filter", nextFilter);
    return `${basePath}${params.size ? `?${params.toString()}` : ""}`;
  }

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (filter !== "all") params.set("filter", filter);
    params.set("page", String(nextPage));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <AppShell activeSection="recalls" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Preventive care</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Recalls
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track checkups, cleaning and patient-specific recall cycles.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            href={`${basePath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            New recall
          </Link>
        </div>

        {(searchParams.created || searchParams.updated) && (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Recall {searchParams.created ? "created" : "updated"} successfully.
          </p>
        )}

        <form
          action={basePath}
          className="my-6 flex flex-col gap-2 sm:flex-row"
          role="search"
        >
          <input type="hidden" name="filter" value={filter} />
          <label className="sr-only" htmlFor="recall-search">
            Search by patient or recall
          </label>
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={query}
              id="recall-search"
              maxLength={100}
              name="q"
              placeholder="Search patient or recall"
              type="search"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <nav
          aria-label="Filter recalls"
          className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1"
        >
          {filters.map(([value, label]) => (
            <Link
              aria-current={filter === value ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                filter === value
                  ? "bg-teal-100 text-teal-900"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              href={filterHref(value)}
              key={value}
            >
              {label}
            </Link>
          ))}
        </nav>

        <section
          aria-label="Recall results"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {recalls.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                <CalendarClock aria-hidden="true" className="size-6" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {query || filter !== "all"
                  ? "No matching recalls"
                  : "No recalls yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Create a recall when a patient needs a future checkup or
                cleaning. Recalls are created only when you explicitly add them.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {recalls.map((recall) => {
                  const overdue = isRecallOverdue(
                    recall.dueDate,
                    recall.status,
                    today,
                  );
                  const title =
                    recall.type === "CUSTOM"
                      ? recall.customName
                      : recallTypeLabels[recall.type];
                  return (
                    <Link
                      className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                      href={`${basePath}/${recall.id}`}
                      key={recall.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {recall.patient.fullName}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{title}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            overdue
                              ? "bg-red-50 text-red-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {overdue
                            ? "Overdue"
                            : recall.status === "ACTIVE"
                              ? recall.dueDate.toISOString().slice(0, 10) ===
                                today
                                ? "Due today"
                                : "Upcoming"
                              : recallStatusLabels[recall.status]}
                        </span>
                        <span className="text-sm text-slate-600">
                          Due {formatRecallDate(recall.dueDate)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-slate-500">
                  {pagination.totalCount} recall
                  {pagination.totalCount === 1 ? "" : "s"} · Page{" "}
                  {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  {pagination.hasPreviousPage && (
                    <Link
                      className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-slate-50"
                      href={pageHref(pagination.page - 1)}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />{" "}
                      Previous
                    </Link>
                  )}
                  {pagination.hasNextPage && (
                    <Link
                      className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-slate-50"
                      href={pageHref(pagination.page + 1)}
                    >
                      Next{" "}
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
