"use server";

import { ClinicEquipmentStatus, ClinicRole, EquipmentMaintenanceType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { assertFeatureEnabled, BillingAccessRestrictedError, BillingFeatureUnavailableError } from "@/features/billing/lib/billing-entitlements";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const dateString = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const equipmentSchema = z.object({
  clinicId: uuid,
  name: z.string().trim().min(2).max(160),
  equipmentType: z.enum(["DENTAL_CHAIR", "AUTOCLAVE", "COMPRESSOR", "X_RAY", "INTRAORAL_SCANNER", "ULTRASONIC_SCALER", "OTHER"]),
  brand: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  purchaseDate: dateString.optional(),
  warrantyUntil: dateString.optional(),
  amcUntil: dateString.optional(),
  nextServiceDue: dateString.optional(),
  nextCalibrationDue: dateString.optional(),
  notes: z.string().trim().max(1000).optional(),
});
const maintenanceSchema = z.object({
  clinicId: uuid,
  equipmentId: uuid,
  maintenanceType: z.nativeEnum(EquipmentMaintenanceType),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendor: z.string().trim().max(160).optional(),
  description: z.string().trim().min(2).max(2000),
  cost: z.union([z.literal(""), z.coerce.number().finite().min(0).max(1000000000)]).optional(),
  reference: z.string().trim().max(120).optional(),
  nextServiceDue: dateString.optional(),
  nextCalibrationDue: dateString.optional(),
});
const statusSchema = z.object({ clinicId: uuid, equipmentId: uuid, status: z.nativeEnum(ClinicEquipmentStatus) });

function dateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("INVALID_DATE");
  return parsed;
}
function equipmentPath(clinicId: string, status: string) {
  return `/clinic/${clinicId}/equipment?status=${status}`;
}
function handleError(clinicId: string, error: unknown): never {
  if (error instanceof BillingFeatureUnavailableError) redirect(equipmentPath(clinicId, "upgrade-required"));
  if (error instanceof BillingAccessRestrictedError) redirect(equipmentPath(clinicId, "subscription-restricted"));
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect(equipmentPath(clinicId, "duplicate-serial"));
  console.error("Equipment maintenance action failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  redirect(equipmentPath(clinicId, "error"));
}

export async function createClinicEquipment(formData: FormData): Promise<never> {
  const parsed = equipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "equipmentManagement");
      await tx.clinicEquipment.create({ data: {
        clinicId: membership.clinicId, name: parsed.data.name,
        equipmentType: parsed.data.equipmentType,
        brand: parsed.data.brand?.trim() || null, model: parsed.data.model?.trim() || null,
        serialNumber: parsed.data.serialNumber?.trim() || null, location: parsed.data.location?.trim() || null,
        purchaseDate: dateOnly(parsed.data.purchaseDate), warrantyUntil: dateOnly(parsed.data.warrantyUntil),
        amcUntil: dateOnly(parsed.data.amcUntil), nextServiceDue: dateOnly(parsed.data.nextServiceDue),
        nextCalibrationDue: dateOnly(parsed.data.nextCalibrationDue), notes: parsed.data.notes?.trim() || null,
      }});
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_DATE") redirect(equipmentPath(membership.clinicId, "invalid-date"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/equipment`);
  redirect(equipmentPath(membership.clinicId, "equipment-created"));
}

export async function recordEquipmentMaintenance(formData: FormData): Promise<never> {
  const parsed = maintenanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "equipmentManagement");
      const equipment = await tx.clinicEquipment.findFirst({
        where: { id: parsed.data.equipmentId, clinicId: membership.clinicId, status: { not: ClinicEquipmentStatus.RETIRED } },
        select: { id: true },
      });
      if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");
      const serviceDate = dateOnly(parsed.data.serviceDate);
      const nextServiceDue = dateOnly(parsed.data.nextServiceDue);
      const nextCalibrationDue = dateOnly(parsed.data.nextCalibrationDue);
      if (!serviceDate) throw new Error("INVALID_DATE");
      await tx.equipmentMaintenanceRecord.create({ data: {
        clinicId: membership.clinicId, equipmentId: equipment.id, recordedByUserId: membership.userId,
        maintenanceType: parsed.data.maintenanceType, serviceDate, vendor: parsed.data.vendor?.trim() || null,
        description: parsed.data.description, cost: parsed.data.cost === "" || parsed.data.cost === undefined ? null : new Prisma.Decimal(parsed.data.cost),
        reference: parsed.data.reference?.trim() || null, nextServiceDue, nextCalibrationDue,
      }});
      await tx.clinicEquipment.update({ where: { id: equipment.id }, data: {
        ...(nextServiceDue ? { nextServiceDue } : {}),
        ...(nextCalibrationDue ? { nextCalibrationDue } : {}),
      }});
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EQUIPMENT_NOT_FOUND") redirect(equipmentPath(membership.clinicId, "equipment-not-found"));
    if (error instanceof Error && error.message === "INVALID_DATE") redirect(equipmentPath(membership.clinicId, "invalid-date"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/equipment`);
  redirect(equipmentPath(membership.clinicId, "maintenance-recorded"));
}

export async function updateClinicEquipmentStatus(formData: FormData): Promise<never> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "equipmentManagement");
      const updated = await tx.clinicEquipment.updateMany({
        where: { id: parsed.data.equipmentId, clinicId: membership.clinicId },
        data: { status: parsed.data.status },
      });
      if (updated.count !== 1) throw new Error("EQUIPMENT_NOT_FOUND");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EQUIPMENT_NOT_FOUND") redirect(equipmentPath(membership.clinicId, "equipment-not-found"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/equipment`);
  redirect(equipmentPath(membership.clinicId, "status-updated"));
}
