"use server";

import { ClinicRole, Prisma, StaffAttendanceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";
import { clinicLocalTimeToUtc } from "@/features/team/lib/attendance-time";

function parseUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function redirectStatus(clinicId: string, status: string): never {
  redirect(`/clinic/${clinicId}/hr/attendance?status=${status}`);
}

export async function saveStaffAttendance(formData: FormData): Promise<never> {
  const clinicId = parseUuid(formData.get("clinicId"));
  const userId = parseUuid(formData.get("userId"));
  const date = formData.get("attendanceDate");
  const status = formData.get("status");
  const checkIn = formData.get("checkIn");
  const checkOut = formData.get("checkOut");
  const notes = formData.get("notes");

  if (!clinicId || !userId || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect("/clinics");
  }
  const actor = await requireClinicRole(clinicId, [ClinicRole.OWNER]);
  if (!Object.values(StaffAttendanceStatus).includes(status as StaffAttendanceStatus)) {
    redirectStatus(clinicId, "invalid");
  }
  if (
    (checkIn !== null && typeof checkIn !== "string") ||
    (checkOut !== null && typeof checkOut !== "string") ||
    (notes !== null && typeof notes !== "string")
  ) redirectStatus(clinicId, "invalid");

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    redirectStatus(clinicId, "invalid");
  }
  const clinic = await prisma.clinic.findUnique({
    where: { id: actor.clinicId },
    select: { timeZone: true },
  });
  if (!clinic) redirectStatus(clinicId, "unavailable");

  const selectedStatus = status as StaffAttendanceStatus;
  const requiresTime = selectedStatus === StaffAttendanceStatus.PRESENT || selectedStatus === StaffAttendanceStatus.HALF_DAY;
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (
    requiresTime &&
    (typeof checkIn !== "string" || !timePattern.test(checkIn))
  ) redirectStatus(clinicId, "invalid");
  if (typeof checkOut === "string" && checkOut && !timePattern.test(checkOut)) {
    redirectStatus(clinicId, "invalid");
  }
  if (requiresTime && typeof checkOut === "string" && checkOut && checkOut < (checkIn as string)) {
    redirectStatus(clinicId, "invalid");
  }
  if (!requiresTime && ((typeof checkIn === "string" && checkIn) || (typeof checkOut === "string" && checkOut))) {
    redirectStatus(clinicId, "invalid");
  }

  const target = await prisma.clinicMembership.findFirst({
    where: {
      clinicId: actor.clinicId,
      userId,
      role: ClinicRole.STAFF,
      active: true,
      revokedAt: null,
      staffProfile: { is: { active: true } },
    },
    select: { userId: true },
  });
  if (!target) redirectStatus(clinicId, "not-found");

  const checkInAt = requiresTime
    ? clinicLocalTimeToUtc(date, checkIn as string, clinic.timeZone)
    : null;
  const checkOutAt = requiresTime && typeof checkOut === "string" && checkOut
    ? clinicLocalTimeToUtc(date, checkOut, clinic.timeZone)
    : null;
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
    redirectStatus(clinicId, "invalid");
  }

  try {
    await prisma.clinicStaffAttendance.upsert({
      where: { userId_clinicId_attendanceDate: { userId, clinicId: actor.clinicId, attendanceDate: parsedDate } },
      create: {
        clinicId: actor.clinicId,
        userId,
        recordedByUserId: actor.userId,
        attendanceDate: parsedDate,
        status: selectedStatus,
        checkInAt,
        checkOutAt,
        notes: typeof notes === "string" ? notes.trim().slice(0, 500) || null : null,
      },
      update: {
        recordedByUserId: actor.userId,
        status: selectedStatus,
        checkInAt,
        checkOutAt,
        notes: typeof notes === "string" ? notes.trim().slice(0, 500) || null : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Staff attendance save failed", { code: error.code });
    } else {
      console.error("Staff attendance save failed");
    }
    redirectStatus(clinicId, "error");
  }

  revalidatePath(`/clinic/${clinicId}/hr/attendance`);
  redirectStatus(clinicId, "saved");
}
