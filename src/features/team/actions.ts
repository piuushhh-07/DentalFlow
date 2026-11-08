"use server";

import {
  ClinicPermission,
  ClinicRole,
  DentistWorkingStatus,
  Prisma,
  StaffJobTitle,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireClinicPermission,
  requireClinicRole,
} from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";
import { dentistAvailabilitySchema } from "@/features/appointments/lib/appointment-validation";
import { dentistProfileSchema } from "@/features/team/lib/team-validation";

export type TeamActionState = Readonly<{
  error?: string;
  success?: string;
}>;

const emptyState: TeamActionState = {};

function readAvailability(formData: FormData) {
  return dentistAvailabilitySchema.safeParse(
    Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isWorking: formData.get(`day-${dayOfWeek}-enabled`) === "on",
      startTime: formData.get(`day-${dayOfWeek}-start`) || "09:00",
      endTime: formData.get(`day-${dayOfWeek}-end`) || "17:00",
    })),
  );
}

function readDentistProfile(formData: FormData) {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const availability = readAvailability(formData);
  const parsed = dentistProfileSchema.safeParse({
    dentistId: formData.get("dentistId") || undefined,
    name: formData.get("name"),
    profilePhotoUrl: formData.get("profilePhotoUrl") ?? "",
    email: formData.get("email") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    qualifications: formData.get("qualifications") ?? "",
    specialization: formData.get("specialization") ?? "",
    registrationNumber: formData.get("registrationNumber") ?? "",
    registrationCouncil: formData.get("registrationCouncil") ?? "",
    yearsExperience: formData.get("yearsExperience") ?? "",
    biography: formData.get("biography") ?? "",
    consultationFee: formData.get("consultationFee") ?? "",
    workingStatus: formData.get("workingStatus") ?? DentistWorkingStatus.ACTIVE,
    weeklyAvailability: availability.success ? availability.data : null,
  });
  if (!clinicId.success || !availability.success || !parsed.success) {
    return { success: false as const };
  }
  return { success: true as const, clinicId: clinicId.data, data: parsed.data };
}

export async function saveDentistProfileAction(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = readDentistProfile(formData);
  if (!parsed.success)
    return { error: "Check the dentist details and weekly working hours." };

  const membership = await requireClinicPermission(
    parsed.clinicId,
    ClinicPermission.STAFF_MANAGE,
  );
  const { dentistId, ...profile } = parsed.data;
  const active = profile.workingStatus !== DentistWorkingStatus.INACTIVE;

  try {
    const savedDentistId = await prisma.$transaction(async (transaction) => {
      let savedId = dentistId;
      if (dentistId) {
        const updated = await transaction.clinicDentist.updateMany({
          where: { id: dentistId, clinicId: membership.clinicId },
          data: { ...profile, active },
        });
        if (updated.count !== 1) return null;
      } else {
        const created = await transaction.clinicDentist.create({
          data: { ...profile, clinicId: membership.clinicId, active },
          select: { id: true },
        });
        savedId = created.id;
      }
      await transaction.clinicStaffAudit.create({
        data: {
          clinicId: membership.clinicId,
          actorUserId: membership.userId,
          action: dentistId
            ? "DENTIST_PROFILE_UPDATED"
            : "DENTIST_PROFILE_CREATED",
          targetEmail: profile.email,
          details: { dentistId: savedId, workingStatus: profile.workingStatus },
        },
      });
      return savedId;
    });
    if (!savedDentistId) {
      return { error: "This dentist profile is not available in this clinic." };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error: "A dentist with this name already exists in this clinic.",
      };
    }
    console.error("Dentist profile save failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "We couldn't save the dentist profile. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/team`);
  revalidatePath(`/clinic/${membership.clinicId}/team/dentists`);
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  return { success: "Dentist profile saved." };
}

export async function updateClinicStaffProfileAction(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const userId = z.string().uuid().safeParse(formData.get("userId"));
  const jobTitle = z
    .nativeEnum(StaffJobTitle)
    .safeParse(formData.get("jobTitle"));
  const phoneNumber = z
    .string()
    .trim()
    .max(20)
    .safeParse(formData.get("phoneNumber") ?? "");
  const active = z.enum(["true", "false"]).safeParse(formData.get("active"));
  if (
    !clinicId.success ||
    !userId.success ||
    !jobTitle.success ||
    !phoneNumber.success ||
    !active.success
  ) {
    return { error: "Check the staff details and try again." };
  }
  const owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  if (userId.data === owner.userId) {
    return {
      error: "Owner access cannot be changed from the staff directory.",
    };
  }
  const member = await prisma.clinicMembership.findFirst({
    where: {
      clinicId: owner.clinicId,
      userId: userId.data,
      role: "STAFF",
    },
    select: { userId: true },
  });
  if (!member)
    return { error: "This staff member is not available in this clinic." };
  const isActive = active.data === "true";

  await prisma.$transaction(async (transaction) => {
    await transaction.clinicMembership.updateMany({
      where: { clinicId: owner.clinicId, userId: userId.data, role: "STAFF" },
      data: { active: isActive },
    });
    await transaction.clinicStaffProfile.upsert({
      where: {
        userId_clinicId: { userId: userId.data, clinicId: owner.clinicId },
      },
      create: {
        userId: userId.data,
        clinicId: owner.clinicId,
        jobTitle: jobTitle.data,
        phoneNumber: phoneNumber.data || null,
        active: isActive,
      },
      update: {
        jobTitle: jobTitle.data,
        phoneNumber: phoneNumber.data || null,
        active: isActive,
      },
    });
    await transaction.clinicStaffAudit.create({
      data: {
        clinicId: owner.clinicId,
        actorUserId: owner.userId,
        targetUserId: userId.data,
        action: isActive ? "STAFF_PROFILE_UPDATED" : "ACCESS_DEACTIVATED",
        details: { jobTitle: jobTitle.data, active: isActive },
      },
    });
  });

  revalidatePath(`/clinic/${owner.clinicId}/settings/staff`);
  revalidatePath(`/clinic/${owner.clinicId}/team/staff`);
  return {
    success: isActive ? "Staff profile updated." : "Staff access deactivated.",
  };
}

export async function saveClinicStaffPermissionsAction(
  _previousState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const userId = z.string().uuid().safeParse(formData.get("userId"));
  const permissions = z
    .array(z.nativeEnum(ClinicPermission))
    .safeParse(formData.getAll("permissions"));
  if (!clinicId.success || !userId.success || !permissions.success) {
    return { error: "Choose valid staff permissions." };
  }
  const owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  if (userId.data === owner.userId) {
    return { error: "Owner permissions cannot be changed here." };
  }
  const member = await prisma.clinicMembership.findFirst({
    where: {
      clinicId: owner.clinicId,
      userId: userId.data,
      role: "STAFF",
    },
    select: { userId: true },
  });
  if (!member)
    return { error: "This staff member is not available in this clinic." };

  const uniquePermissions = Array.from(new Set(permissions.data));
  await prisma.$transaction(async (transaction) => {
    await transaction.clinicPermissionGrant.deleteMany({
      where: { clinicId: owner.clinicId, userId: userId.data },
    });
    if (uniquePermissions.length > 0) {
      await transaction.clinicPermissionGrant.createMany({
        data: uniquePermissions.map((permission) => ({
          clinicId: owner.clinicId,
          userId: userId.data,
          permission,
        })),
      });
    }
    await transaction.clinicMembership.updateMany({
      where: { clinicId: owner.clinicId, userId: userId.data, role: "STAFF" },
      data: { permissionsConfigured: true },
    });
    await transaction.clinicStaffAudit.create({
      data: {
        clinicId: owner.clinicId,
        actorUserId: owner.userId,
        targetUserId: userId.data,
        action: "PERMISSIONS_UPDATED",
        details: { permissions: uniquePermissions },
      },
    });
  });
  revalidatePath(`/clinic/${owner.clinicId}/settings/staff`);
  return { success: "Staff permissions saved." };
}

export { emptyState as initialTeamActionState };
