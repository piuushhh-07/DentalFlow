"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const groupName = z.string().trim().min(2).max(120);

function branchPath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/branches?status=${status}`;
}

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

export async function createClinicGroup(formData: FormData): Promise<never> {
  const clinicId = uuid.safeParse(value(formData, "clinicId"));
  const name = groupName.safeParse(value(formData, "name"));
  if (!clinicId.success || !name.success) redirect("/clinics");

  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      const currentClinic = await tx.clinic.findFirst({
        where: { id: membership.clinicId },
        select: { id: true, clinicGroupId: true },
      });
      if (!currentClinic || currentClinic.clinicGroupId) {
        throw new Error("CLINIC_ALREADY_GROUPED");
      }
      const group = await tx.clinicGroup.create({
        data: { name: name.data, ownerUserId: membership.userId },
        select: { id: true },
      });
      const updated = await tx.clinic.updateMany({
        where: { id: currentClinic.id, clinicGroupId: null },
        data: { clinicGroupId: group.id },
      });
      if (updated.count !== 1) throw new Error("CLINIC_GROUP_CONFLICT");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("Clinic group creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "none",
    });
    redirect(branchPath(membership.clinicId, "create-error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/branches`);
  revalidatePath("/clinics");
  redirect(branchPath(membership.clinicId, "created"));
}

export async function addClinicGroupBranch(formData: FormData): Promise<never> {
  const clinicId = uuid.safeParse(value(formData, "clinicId"));
  const groupId = uuid.safeParse(value(formData, "groupId"));
  const targetClinicId = uuid.safeParse(value(formData, "targetClinicId"));
  if (!clinicId.success || !groupId.success || !targetClinicId.success) redirect("/clinics");
  if (clinicId.data === targetClinicId.data) redirect(branchPath(clinicId.data, "invalid"));

  const current = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  await requireClinicRole(targetClinicId.data, [ClinicRole.OWNER]);

  try {
    await prisma.$transaction(async (tx) => {
      const group = await tx.clinicGroup.findFirst({
        where: { id: groupId.data, ownerUserId: current.userId, clinics: { some: { id: current.clinicId } } },
        select: { id: true },
      });
      if (!group) throw new Error("GROUP_NOT_FOUND");
      const target = await tx.clinic.findFirst({
        where: { id: targetClinicId.data, clinicGroupId: null,
          memberships: { some: { userId: current.userId, role: ClinicRole.OWNER, revokedAt: null } } },
        select: { id: true },
      });
      if (!target) throw new Error("TARGET_NOT_AVAILABLE");
      const result = await tx.clinic.updateMany({
        where: { id: target.id, clinicGroupId: null },
        data: { clinicGroupId: group.id },
      });
      if (result.count !== 1) throw new Error("GROUP_CONFLICT");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("Adding clinic group branch failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "none",
    });
    redirect(branchPath(current.clinicId, "add-error"));
  }
  revalidatePath(`/clinic/${current.clinicId}/branches`);
  revalidatePath(`/clinic/${targetClinicId.data}`);
  redirect(branchPath(current.clinicId, "branch-added"));
}

export async function removeClinicGroupBranch(formData: FormData): Promise<never> {
  const clinicId = uuid.safeParse(value(formData, "clinicId"));
  const groupId = uuid.safeParse(value(formData, "groupId"));
  const targetClinicId = uuid.safeParse(value(formData, "targetClinicId"));
  if (!clinicId.success || !groupId.success || !targetClinicId.success) redirect("/clinics");
  if (clinicId.data === targetClinicId.data) redirect(branchPath(clinicId.data, "keep-current"));

  const current = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  await requireClinicRole(targetClinicId.data, [ClinicRole.OWNER]);
  let status = "remove-error";
  try {
    status = await prisma.$transaction(async (tx) => {
      const group = await tx.clinicGroup.findFirst({
        where: { id: groupId.data, ownerUserId: current.userId, clinics: { some: { id: current.clinicId } } },
        select: { id: true },
      });
      if (!group) return "group-not-found";
      const count = await tx.clinic.count({ where: { clinicGroupId: group.id } });
      if (count <= 2) return "minimum-branches";
      const result = await tx.clinic.updateMany({
        where: { id: targetClinicId.data, clinicGroupId: group.id,
          memberships: { some: { userId: current.userId, role: ClinicRole.OWNER, revokedAt: null } } },
        data: { clinicGroupId: null },
      });
      return result.count === 1 ? "branch-removed" : "remove-conflict";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("Removing clinic group branch failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "none",
    });
  }
  revalidatePath(`/clinic/${current.clinicId}/branches`);
  revalidatePath(`/clinic/${targetClinicId.data}`);
  redirect(branchPath(current.clinicId, status));
}

export async function dissolveClinicGroup(formData: FormData): Promise<never> {
  const clinicId = uuid.safeParse(value(formData, "clinicId"));
  const groupId = uuid.safeParse(value(formData, "groupId"));
  if (!clinicId.success || !groupId.success) redirect("/clinics");
  const current = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      const group = await tx.clinicGroup.findFirst({
        where: { id: groupId.data, ownerUserId: current.userId, clinics: { some: { id: current.clinicId } } },
        select: { id: true },
      });
      if (!group) throw new Error("GROUP_NOT_FOUND");
      await tx.clinic.updateMany({ where: { clinicGroupId: group.id }, data: { clinicGroupId: null } });
      await tx.clinicGroup.delete({ where: { id: group.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    console.error("Clinic group dissolution failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "none",
    });
    redirect(branchPath(current.clinicId, "dissolve-error"));
  }
  revalidatePath(`/clinic/${current.clinicId}/branches`);
  revalidatePath("/clinics");
  redirect(branchPath(current.clinicId, "dissolved"));
}
