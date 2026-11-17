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
import { listStaffAttendanceForMonth } from "@/features/team/lib/attendance-report-repository";
import { attendanceDurationMinutes, getAttendanceMonthRange } from "@/features/team/lib/attendance-report";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function clinicMonth(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}`;
}

function timeLabel(value: Date | null, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(value);
}

export default async function StaffAttendanceReportPage({
  params, searchParams,
}: {
  params: { clinicId: string };
  searchParams?: { month?: string };
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

  const currentMonth = clinicMonth(clinic.timeZone);
  const requestedMonth = searchParams?.month;
  let month = currentMonth;
  if (typeof requestedMonth === "string") {
    try {
      const range = getAttendanceMonthRange(requestedMonth);
      if (range.startDate.toISOString().slice(0, 7) === requestedMonth && requestedMonth <= currentMonth) {
        month = requestedMonth;
      }
    } catch {
      month = currentMonth;
    }
  }

  const [staff, monthRange] = await Promise.all([
    listStaffAttendanceForMonth(owner.clinicId, month),
    Promise.resolve(getAttendanceMonthRange(month)),
  ]);
  const allRecords = staff.flatMap((member) => member.attendanceRecords);
  const statuses = Object.values(StaffAttendanceStatus);
  const counts = statuses.reduce((result, status) => {
    result[status] = allRecords.filter((record) => record.status === status).length;
    return result;
  }, {} as Record<StaffAttendanceStatus, number>);
  const totalMinutes = allRecords.reduce(
    (sum, record) => sum + attendanceDurationMinutes(record.checkInAt, record.checkOutAt),
    0,
  );
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  const monthLabel = dateFormatter.format(monthRange.startDate);

  return (
    <AppShell activeSection="team" clinicId={owner.clinicId}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link className="text-sm font-medium text-teal-800 hover:underline" href={`/clinic/${owner.clinicId}/hr/attendance`}>← Daily attendance</Link>
            <p className="mt-4 text-sm font-medium text-teal-700">{clinic.name} · HR reports</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Monthly attendance</h1>
            <p className="mt-2 text-sm text-slate-600">Review attendance records and recorded shift hours by staff member.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form method="GET" className="flex items-end gap-2">
              <label className="text-sm font-medium text-slate-700">Month
                <input type="month" name="month" max={currentMonth} defaultValue={month} className="mt-1 block h-10 rounded-md border border-slate-300 bg-white px-3" />
              </label>
              <button type="submit" className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">View</button>
            </form>
            <a href={`/clinic/${owner.clinicId}/hr/attendance/reports/export?month=${month}`} className="inline-flex h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Export CSV</a>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Active staff</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{staff.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Attendance entries</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{allRecords.length}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Recorded shift hours</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{(totalMinutes / 60).toLocaleString("en-IN", { maximumFractionDigits: 1 })} h</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Report period</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{monthLabel}</p>
          </article>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statuses.map((status) => (
            <article className="rounded-xl border border-slate-200 bg-white p-4" key={status}>
              <p className="text-xs font-medium text-slate-500">{status.replace("_", " ")}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{counts[status]}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Staff-wise summary · {monthLabel}</h2>
            <p className="mt-1 text-sm text-slate-500">Hours include only records with both check-in and check-out times. Pending days are not treated as absences.</p>
          </div>
          {staff.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Staff member</th>
                    {statuses.map((status) => <th className="px-3 py-3 text-right" key={status}>{status.replace("_", " ")}</th>)}
                    <th className="px-5 py-3 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staff.map((member) => {
                    const records = member.attendanceRecords;
                    const hours = records.reduce((sum, record) => sum + attendanceDurationMinutes(record.checkInAt, record.checkOutAt), 0) / 60;
                    return (
                      <tr key={member.userId}>
                        <td className="whitespace-nowrap px-5 py-4">
                          <p className="font-medium text-slate-900">{member.user.displayName || member.user.email || "Clinic staff"}</p>
                          <p className="mt-1 text-xs capitalize text-slate-500">{member.staffProfile?.jobTitle.replaceAll("_", " ").toLowerCase() || "Staff"}</p>
                        </td>
                        {statuses.map((status) => <td className="px-3 py-4 text-right tabular-nums text-slate-700" key={status}>{records.filter((record) => record.status === status).length}</td>)}
                        <td className="whitespace-nowrap px-5 py-4 text-right font-medium tabular-nums text-slate-900">{hours.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-slate-500">No active staff profiles found for this clinic.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Attendance detail</h2>
          </div>
          {allRecords.length ? (
            <div className="divide-y divide-slate-100">
              {staff.flatMap((member) => member.attendanceRecords.map((record, index) => (
                <div className="grid gap-2 px-5 py-3 sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]" key={`${member.userId}-${index}`}>
                  <span className="font-medium text-slate-900">{member.user.displayName || member.user.email || "Clinic staff"}</span>
                  <span className="text-slate-600">{record.attendanceDate.toISOString().slice(0, 10)}</span>
                  <span className="text-slate-600">{record.status.replace("_", " ")}</span>
                  <span className="text-slate-600">{timeLabel(record.checkInAt, clinic.timeZone)} – {timeLabel(record.checkOutAt, clinic.timeZone)}</span>
                  <span className="text-slate-500">{record.notes || "—"}</span>
                </div>
              )))}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No attendance entries recorded for {monthLabel} yet.</p>
          )}
        </section>
        <p className="text-xs leading-5 text-slate-500">This report summarizes records entered in DentalFlow. It is not a statutory payroll statement. Please verify the clinic&apos;s official HR and record-retention requirements.</p>
      </div>
    </AppShell>
  );
}
