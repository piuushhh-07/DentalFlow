"use server";

import {
  ClinicRole,
  Prisma,
  StaffLeaveRequestStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireClinicMembership, requireClinicRole } from "@/features/auth/lib/server-auth";
import { clinicDateInTimeZone, isValidDateOnly } from "@/features/team/lib/staff-leave";
import { prisma } from "@/lib/db/prisma";

function parseUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function leavePath(clinicId: string, status: string): never {
  redirect(`/clinic/${clinicId}/hr/leave?status=${status}`);
}

export async function createStaffLeaveRequest(formData: FormData): Promise<never> {
  const clinicId = parseUuid(formData.get("clinicId"));
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate");
  const reason = formData.get("reason");
  if (!clinicId || typeof startDate !== "string" || typeof endDate !== "string" || typeof reason !== "string") {
    redirect("/clinics");
  }

  const membership = await requireClinicMembership(clinicId);
  if (membership.role !== ClinicRole.STAFF) leavePath(clinicId, "unavailable");
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate) || endDate < startDate) {
    leavePath(clinicId, "invalid");
  }
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 500) leavePath(clinicId, "invalid");

  const [clinic, staffProfile] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: membership.clinicId }, select: { timeZone: true } }),
    prisma.clinicStaffProfile.findFirst({
      where: { clinicId: membership.clinicId, userId: membership.userId, active: true },
      select: { id: true },
    }),
  ]);
  if (!clinic || !staffProfile) leavePath(clinicId, "unavailable");

  const today = clinicDateInTimeZone(new Date(), clinic.timeZone);
  if (startDate < today) leavePath(clinicId, "past-date");
  const days = Math.floor(
    (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000,
  ) + 1;
  if (days > 90) leavePath(clinicId, "too-long");

  try {
    await prisma.$transaction(async (transaction) => {
      const lockKey = `staff-leave:${membership.clinicId}:${membership.userId}`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL
      `;
      const overlapping = await transaction.clinicStaffLeaveRequest.findFirst({
        where: {
          clinicId: membership.clinicId,
          userId: membership.userId,
          status: { in: [StaffLeaveRequestStatus.PENDING, StaffLeaveRequestStatus.APPROVED] },
          startDate: { lte: new Date(`${endDate}T00:00:00.000Z`) },
          endDate: { gte: new Date(`${startDate}T00:00:00.000Z`) },
        },
        select: { id: true },
      });
      if (overlapping) throw new Error("LEAVE_OVERLAP");
      await transaction.clinicStaffLeaveRequest.create({
        data: {
          clinicId: membership.clinicId,
          userId: membership.userId,
          startDate: new Date(`${startDate}T00:00:00.000Z`),
          endDate: new Date(`${endDate}T00:00:00.000Z`),
          reason: cleanReason,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "LEAVE_OVERLAP") {
      leavePath(clinicId, "overlap");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      leavePath(clinicId, "conflict");
    }
    console.error("Staff leave request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "none",
    });
    leavePath(clinicId, "error");
  }

  revalidatePath(`/clinic/${clinicId}/hr/leave`);
  leavePath(clinicId, "submitted");
}

export async function reviewStaffLeaveRequest(formData: FormData): Promise<never> {
  const clinicId = parseUuid(formData.get("clinicId"));
  const requestId = parseUuid(formData.get("requestId"));
  const decision = formData.get("decision");
  const reviewerNotes = formData.get("reviewerNotes");
  if (!clinicId || !requestId) redirect("/clinics");

  const owner = await requireClinicRole(clinicId, [ClinicRole.OWNER]);
  if (decision !== StaffLeaveRequestStatus.APPROVED && decision !== StaffLeaveRequestStatus.REJECTED) {
    leavePath(clinicId, "invalid");
  }
  if (reviewerNotes !== null && typeof reviewerNotes !== "string") leavePath(clinicId, "invalid");

  const result = await prisma.clinicStaffLeaveRequest.updateMany({
    where: {
      id: requestId,
      clinicId: owner.clinicId,
      status: StaffLeaveRequestStatus.PENDING,
    },
    data: {
      status: decision,
      reviewedByUserId: owner.userId,
      reviewedAt: new Date(),
      reviewerNotes: typeof reviewerNotes === "string" ? reviewerNotes.trim().slice(0, 500) || null : null,
    },
  });
  if (result.count !== 1) leavePath(clinicId, "already-reviewed");

  revalidatePath(`/clinic/${clinicId}/hr/leave`);
  leavePath(clinicId, decision === StaffLeaveRequestStatus.APPROVED ? "approved" : "rejected");
}
