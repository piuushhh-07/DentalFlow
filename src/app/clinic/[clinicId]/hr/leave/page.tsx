import Link from "next/link";
import { ClinicRole, StaffLeaveRequestStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createStaffLeaveRequest,
  reviewStaffLeaveRequest,
} from "@/features/team/staff-leave-actions";
import { clinicDateInTimeZone, inclusiveLeaveDays } from "@/features/team/lib/staff-leave";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  submitted: "Your leave request has been submitted for owner review.",
  approved: "Leave request approved.",
  rejected: "Leave request rejected.",
  "already-reviewed": "This request has already been reviewed.",
  overlap: "You already have a pending or approved request that overlaps these dates.",
  "past-date": "Leave requests must start today or in the future.",
  "too-long": "A single leave request cannot exceed 90 calendar days.",
  invalid: "Check the leave dates and reason, then try again.",
  conflict: "Another request was saved at the same time. Refresh and try again.",
  unavailable: "The leave request service is unavailable for this account.",
  error: "We couldn't save the leave request. Please try again.",
};

function dateLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone,
  }).format(value);
}

function dateOnlyLabel(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export default async function StaffLeavePage({
  params, searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { status?: string };
}) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(parsed.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    if (error instanceof ClinicRoleDeniedError) redirect(`/clinic/${parsed.data}`);
    throw error;
  }

  const isOwner = membership.role === ClinicRole.OWNER;
  const [clinic, staffProfile] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: membership.clinicId },
      select: { name: true, timeZone: true },
    }),
    isOwner
      ? Promise.resolve(null)
      : prisma.clinicStaffProfile.findFirst({
          where: { clinicId: membership.clinicId, userId: membership.userId, active: true },
          select: { id: true },
        }),
  ]);
  if (!clinic || (!isOwner && !staffProfile)) notFound();

  const today = clinicDateInTimeZone(new Date(), clinic.timeZone);
  const requests = await prisma.clinicStaffLeaveRequest.findMany({
    where: {
      clinicId: membership.clinicId,
      ...(isOwner ? {} : { userId: membership.userId }),
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: isOwner ? 100 : 50,
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      reason: true,
      status: true,
      reviewedAt: true,
      reviewerNotes: true,
      createdAt: true,
      membership: {
        select: {
          user: { select: { displayName: true, email: true } },
          staffProfile: { select: { jobTitle: true } },
        },
      },
      reviewedBy: { select: { displayName: true } },
    },
  });

  const pendingCount = requests.filter((request) => request.status === StaffLeaveRequestStatus.PENDING).length;
  const approvedCount = requests.filter((request) => request.status === StaffLeaveRequestStatus.APPROVED).length;
  const rejectedCount = requests.filter((request) => request.status === StaffLeaveRequestStatus.REJECTED).length;
  const message = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="leave" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link className="text-sm font-medium text-teal-800 hover:underline" href={isOwner ? `/clinic/${membership.clinicId}/hr/attendance` : `/clinic/${membership.clinicId}`}>{isOwner ? "← Staff attendance" : "← Clinic dashboard"}</Link>
            <p className="mt-4 text-sm font-medium text-teal-700">{clinic.name} · HR</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Staff leave requests</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {isOwner
                ? "Review staff leave requests and record an approval decision."
                : "Submit planned leave for owner review and track the decision here."}
            </p>
          </div>
          {isOwner ? <Link className="text-sm font-semibold text-teal-800 hover:underline" href={`/clinic/${membership.clinicId}/settings/staff`}>Staff access →</Link> : null}
        </header>

        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Pending review</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{pendingCount}</p>
            <p className="mt-1 text-xs text-slate-500">{isOwner ? "In the latest 100 requests" : "Your requests"}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{approvedCount}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Rejected</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{rejectedCount}</p>
          </article>
        </section>

        {!isOwner ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Request leave</h2>
            <p className="mt-1 text-sm text-slate-600">Choose a date range and provide a short reason. Requests are limited to 90 calendar days and overlapping pending or approved requests are blocked.</p>
            <form action={createStaffLeaveRequest} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="clinicId" value={membership.clinicId} />
              <label className="text-sm font-medium text-slate-700">Start date
                <input required type="date" name="startDate" min={today} defaultValue={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">End date
                <input required type="date" name="endDate" min={today} defaultValue={today} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-3 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason
                <textarea required name="reason" maxLength={500} rows={3} placeholder="Brief reason for the leave request" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Submit leave request</button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">{isOwner ? "Clinic leave register" : "My leave requests"}</h2>
            <p className="mt-1 text-sm text-slate-500">{isOwner ? "Latest 100 requests across active and historical staff memberships." : "Latest 50 requests submitted from your staff account."}</p>
          </div>
          {requests.length ? (
            <div className="divide-y divide-slate-100">
              {requests.map((request) => {
                const days = inclusiveLeaveDays(request.startDate.toISOString().slice(0, 10), request.endDate.toISOString().slice(0, 10));
                return (
                  <article className="space-y-3 p-5" key={request.id}>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <h3 className="font-semibold text-slate-900">{request.membership.user.displayName || request.membership.user.email || "Clinic staff"}</h3>
                        <p className="mt-1 text-xs capitalize text-slate-500">{request.membership.staffProfile?.jobTitle.replaceAll("_", " ").toLowerCase() || "Staff"}</p>
                        <p className="mt-2 text-sm text-slate-700">{dateOnlyLabel(request.startDate)} – {dateOnlyLabel(request.endDate)} · {days} {days === 1 ? "day" : "days"}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{request.reason}</p>
                      </div>
                      <div className="sm:text-right">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${request.status === StaffLeaveRequestStatus.APPROVED ? "bg-emerald-50 text-emerald-800" : request.status === StaffLeaveRequestStatus.REJECTED ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>{request.status.toLowerCase()}</span>
                        <p className="mt-2 text-xs text-slate-500">Submitted {dateLabel(request.createdAt, clinic.timeZone)}</p>
                        {request.reviewedBy?.displayName ? <p className="mt-1 text-xs text-slate-500">Reviewed by {request.reviewedBy.displayName}</p> : null}
                      </div>
                    </div>
                    {request.reviewerNotes ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Owner note: {request.reviewerNotes}</p> : null}
                    {isOwner && request.status === StaffLeaveRequestStatus.PENDING ? (
                      <form action={reviewStaffLeaveRequest} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                        <input type="hidden" name="clinicId" value={membership.clinicId} />
                        <input type="hidden" name="requestId" value={request.id} />
                        <label className="text-xs font-medium text-slate-600">Review note
                          <input name="reviewerNotes" maxLength={500} placeholder="Optional note to staff" className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" />
                        </label>
                        <button type="submit" name="decision" value={StaffLeaveRequestStatus.APPROVED} className="h-9 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Approve</button>
                        <button type="submit" name="decision" value={StaffLeaveRequestStatus.REJECTED} className="h-9 rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No leave requests found.</p>
          )}
        </section>
        <p className="text-xs leading-5 text-slate-500">Approved leave requests are kept as HR records only. They do not automatically create or modify attendance entries, adjust payroll, or send notifications.</p>
      </div>
    </AppShell>
  );
}
