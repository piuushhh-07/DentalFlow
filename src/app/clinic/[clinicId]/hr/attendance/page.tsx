import Link from "next/link";
import { ClinicRole, StaffAttendanceStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import {
  ClinicAccessDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { saveStaffAttendance } from "@/features/team/attendance-actions";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const statuses = Object.values(StaffAttendanceStatus);
const messages: Record<string, string> = {
  saved: "Attendance record saved.",
  invalid: "Check the date, status and time values. Check-out must not be before check-in.",
  "not-found": "That active staff member could not be found.",
  unavailable: "The attendance register is unavailable.",
  error: "We couldn't save this attendance record. Please try again.",
};

function clinicToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeValue(value: Date | null, timeZone: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(value);
}

export default async function StaffAttendancePage({
  params, searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { date?: string; status?: string };
}) {
  const parsed = z.string().uuid().safeParse(params.clinicId);
  if (!parsed.success) notFound();

  let owner;
  try {
    owner = await requireClinicRole(parsed.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    if (error instanceof ClinicRoleDeniedError) redirect(`/clinic/${parsed.data}`);
    throw error;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: owner.clinicId },
    select: { name: true, timeZone: true },
  });
  if (!clinic) notFound();

  const today = clinicToday(clinic.timeZone);
  const requestedDate = searchParams?.date;
  const parsedRequestedDate =
    typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00.000Z`)
      : null;
  const isValidRequestedDate =
    parsedRequestedDate !== null &&
    Number.isFinite(parsedRequestedDate.getTime()) &&
    parsedRequestedDate.toISOString().slice(0, 10) === requestedDate;
  const date = isValidRequestedDate && requestedDate && requestedDate <= today
    ? requestedDate
    : today;
  const attendanceDate = new Date(`${date}T00:00:00.000Z`);

  const [staff, records] = await Promise.all([
    prisma.clinicMembership.findMany({
      where: {
        clinicId: owner.clinicId,
        role: ClinicRole.STAFF,
        active: true,
        revokedAt: null,
        staffProfile: { is: { active: true } },
      },
      orderBy: [{ staffProfile: { jobTitle: "asc" } }, { user: { displayName: "asc" } }],
      select: {
        userId: true,
        user: { select: { displayName: true, email: true } },
        staffProfile: { select: { jobTitle: true } },
      },
    }),
    prisma.clinicStaffAttendance.findMany({
      where: { clinicId: owner.clinicId, attendanceDate },
      select: {
        userId: true, status: true, checkInAt: true, checkOutAt: true, notes: true,
      },
    }),
  ]);

  const byUser = new Map(records.map((record) => [record.userId, record]));
  const counts = statuses.reduce((result, status) => {
    result[status] = records.filter((record) => record.status === status).length;
    return result;
  }, {} as Record<StaffAttendanceStatus, number>);
  const recorded = records.length;
  const pending = Math.max(0, staff.length - recorded);
  const message = searchParams?.status ? messages[searchParams.status] : undefined;

  return (
    <AppShell activeSection="team" clinicId={owner.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link className="text-sm font-medium text-teal-800 hover:underline" href={`/clinic/${owner.clinicId}/settings/staff`}>← Staff access</Link>
            <p className="mt-4 text-sm font-medium text-teal-700">{clinic.name} · HR</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Staff attendance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Record daily presence, absence, leave and working hours for active clinic staff.
              Owners can correct a record for the selected date; every update keeps its original attendance date.
            </p>
          </div>
          <Link
            href={`/clinic/${owner.clinicId}/hr/attendance/reports`}
            className="inline-flex h-10 items-center rounded-md border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
          >
            Monthly report
          </Link>
          <form method="GET" className="flex items-end gap-2">
            <label className="text-sm font-medium text-slate-700">Attendance date
              <input type="date" name="date" max={today} defaultValue={date} className="mt-1 block h-10 rounded-md border border-slate-300 bg-white px-3" />
            </label>
            <button className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">View</button>
          </form>
        </header>

        {message ? <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Active staff</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{staff.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Not recorded</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{pending}</p>
          </article>
          {statuses.map((status) => (
            <article className="rounded-xl border border-slate-200 bg-white p-4" key={status}>
              <p className="text-xs font-medium text-slate-500">{status.replace("_", " ")}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{counts[status]}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Daily register · {new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: clinic.timeZone }).format(attendanceDate)}</h2>
            <p className="mt-1 text-sm text-slate-500">Attendance is recorded in the clinic&apos;s {clinic.timeZone} timezone. No GPS or location tracking is collected.</p>
          </div>
          {staff.length ? (
            <div className="divide-y divide-slate-100">
              {staff.map((member) => {
                const record = byUser.get(member.userId);
                return (
                  <form action={saveStaffAttendance} className="grid gap-3 p-5 lg:grid-cols-[minmax(160px,1.2fr)_140px_130px_130px_minmax(140px,1fr)_auto] lg:items-end" key={member.userId}>
                    <input type="hidden" name="clinicId" value={owner.clinicId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <input type="hidden" name="attendanceDate" value={date} />
                    <div>
                      <p className="font-semibold text-slate-900">{member.user.displayName || member.user.email || "Clinic staff"}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{member.staffProfile?.jobTitle.replaceAll("_", " ").toLowerCase() || "Staff"}</p>
                    </div>
                    <label className="text-xs font-medium text-slate-600">Status
                      <select name="status" defaultValue={record?.status || StaffAttendanceStatus.PRESENT} className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                        {statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">Check in
                      <input type="time" name="checkIn" defaultValue={timeValue(record?.checkInAt || null, clinic.timeZone) || "09:00"} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Check out
                      <input type="time" name="checkOut" defaultValue={timeValue(record?.checkOutAt || null, clinic.timeZone)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">Notes
                      <input name="notes" maxLength={500} defaultValue={record?.notes || ""} placeholder="Optional" className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2 text-sm" />
                    </label>
                    <div className="flex items-center gap-2">
                      <button type="submit" className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Save</button>
                      {record ? <span className="text-xs text-slate-500">Recorded</span> : <span className="text-xs text-amber-700">Pending</span>}
                    </div>
                  </form>
                );
              })}
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No active staff profiles found. Add staff from Staff access first.</p>
          )}
        </section>
        <p className="text-xs leading-5 text-slate-500">
          This is an attendance register, not a payroll calculator or statutory wage/timekeeping system.
          Validate local employment and record-retention requirements before using it as an official HR register.
        </p>
      </div>
    </AppShell>
  );
}
