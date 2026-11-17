import "server-only";

import { ClinicRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getAttendanceMonthRange } from "@/features/team/lib/attendance-report";

export async function listStaffAttendanceForMonth(
  clinicId: string,
  month: string,
) {
  const range = getAttendanceMonthRange(month);
  return prisma.clinicMembership.findMany({
    where: {
      clinicId,
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
      attendanceRecords: {
        where: {
          clinicId,
          attendanceDate: { gte: range.startDate, lt: range.endDate },
        },
        orderBy: { attendanceDate: "asc" },
        select: {
          attendanceDate: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          notes: true,
        },
      },
    },
  });
}
