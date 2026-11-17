import { ClinicRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClinicAccessDeniedError, ClinicRoleDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { listStaffAttendanceForMonth } from "@/features/team/lib/attendance-report-repository";
import { attendanceCsvCell, attendanceDurationMinutes, getAttendanceMonthRange } from "@/features/team/lib/attendance-report";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function formatTime(value: Date | null, timeZone: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
}

export async function GET(request: Request, { params }: { params: { clinicId: string } }) {
  const parsedClinicId = z.string().uuid().safeParse(params.clinicId);
  if (!parsedClinicId.success) notFound();
  let owner;
  try {
    owner = await requireClinicRole(parsedClinicId.data, [ClinicRole.OWNER]);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError || error instanceof ClinicRoleDeniedError) notFound();
    throw error;
  }
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  let monthRange: ReturnType<typeof getAttendanceMonthRange>;
  try {
    if (!monthParam) throw new Error("Missing month");
    monthRange = getAttendanceMonthRange(monthParam);
  } catch {
    notFound();
  }
  const month = monthRange.startDate.toISOString().slice(0, 7);
  const clinic = await prisma.clinic.findUnique({ where: { id: owner.clinicId }, select: { name: true, timeZone: true } });
  if (!clinic) notFound();
  const staff = await listStaffAttendanceForMonth(owner.clinicId, month);
  const rows: Array<Array<string | number>> = [
    ["Clinic", clinic.name],
    ["Report month", month],
    ["Timezone", clinic.timeZone],
    [],
    ["Staff member", "Email", "Job title", "Date", "Status", "Check in", "Check out", "Hours", "Notes"],
  ];
  for (const member of staff) {
    for (const record of member.attendanceRecords) {
      rows.push([member.user.displayName || "", member.user.email || "", member.staffProfile?.jobTitle || "", record.attendanceDate.toISOString().slice(0, 10), record.status, formatTime(record.checkInAt, clinic.timeZone), formatTime(record.checkOutAt, clinic.timeZone), (attendanceDurationMinutes(record.checkInAt, record.checkOutAt) / 60).toFixed(2), record.notes || ""]);
    }
  }
  const csv = rows.map((row) => row.map(attendanceCsvCell).join(",")).join("\r\n");
  return new Response("\uFEFF" + csv + "\r\n", {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="dentalflow-attendance-${month}.csv"` ,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}