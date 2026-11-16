"use server";

import { ClinicRole, DentalLabOrderStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  assertFeatureEnabled,
  BillingAccessRestrictedError,
  BillingFeatureUnavailableError,
} from "@/features/billing/lib/billing-entitlements";
import { prisma } from "@/lib/db/prisma";
import { canTransitionDentalLabOrder } from "@/features/dental-lab/workflow";

const uuid = z.string().uuid();
const partnerSchema = z.object({
  clinicId: uuid,
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});
const orderSchema = z.object({
  clinicId: uuid,
  patientId: uuid,
  partnerId: uuid,
  workType: z.string().trim().min(2).max(100),
  toothNumbers: z.string().trim().max(120).optional(),
  material: z.string().trim().max(120).optional(),
  shade: z.string().trim().max(40).optional(),
  instructions: z.string().trim().max(2000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quotedAmount: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
  ),
});
const statusSchema = z.object({
  clinicId: uuid,
  orderId: uuid,
  status: z.nativeEnum(DentalLabOrderStatus),
  trackingReference: z.string().trim().max(120).optional(),
  remakeReason: z.string().trim().max(1000).optional(),
});

function labPath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/lab?status=${status}`;
}
function optional(value: string | undefined): string | null {
  return value?.trim() || null;
}
function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function createDentalLabPartner(formData: FormData): Promise<never> {
  const parsed = partnerSchema.safeParse({
    clinicId: formData.get("clinicId"),
    name: formData.get("name"),
    contactName: formData.get("contactName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "dentalLabManagement");
      await tx.dentalLabPartner.create({
        data: {
          clinicId: membership.clinicId,
          name: parsed.data.name,
          contactName: optional(parsed.data.contactName),
          phone: optional(parsed.data.phone),
          email: optional(parsed.data.email),
          address: optional(parsed.data.address),
          notes: optional(parsed.data.notes),
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(labPath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(labPath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(labPath(membership.clinicId, "duplicate-partner"));
    }
    console.error("Dental lab partner creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(labPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/lab`);
  redirect(labPath(membership.clinicId, "partner-created"));
}

export async function createDentalLabOrder(formData: FormData): Promise<never> {
  const parsed = orderSchema.safeParse({
    clinicId: formData.get("clinicId"),
    patientId: formData.get("patientId"),
    partnerId: formData.get("partnerId"),
    workType: formData.get("workType"),
    toothNumbers: formData.get("toothNumbers") ?? "",
    material: formData.get("material") ?? "",
    shade: formData.get("shade") ?? "",
    instructions: formData.get("instructions") ?? "",
    dueDate: formData.get("dueDate"),
    quotedAmount: formData.get("quotedAmount") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "dentalLabManagement");
      const [patient, partner] = await Promise.all([
        tx.patient.findFirst({
          where: { id: parsed.data.patientId, clinicId: membership.clinicId, archivedAt: null },
          select: { id: true },
        }),
        tx.dentalLabPartner.findFirst({
          where: { id: parsed.data.partnerId, clinicId: membership.clinicId, active: true },
          select: { id: true },
        }),
      ]);
      if (!patient || !partner) throw new Error("LAB_RELATION_NOT_FOUND");
      await tx.dentalLabOrder.create({
        data: {
          clinicId: membership.clinicId,
          patientId: patient.id,
          partnerId: partner.id,
          createdByUserId: membership.userId,
          workType: parsed.data.workType,
          toothNumbers: optional(parsed.data.toothNumbers),
          material: optional(parsed.data.material),
          shade: optional(parsed.data.shade),
          instructions: optional(parsed.data.instructions),
          dueDate: dateOnly(parsed.data.dueDate),
          quotedAmount: parsed.data.quotedAmount === undefined ? null : new Prisma.Decimal(parsed.data.quotedAmount),
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(labPath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(labPath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Error && error.message === "LAB_RELATION_NOT_FOUND") redirect(labPath(membership.clinicId, "invalid-selection"));
    console.error("Dental lab order creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(labPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/lab`);
  redirect(labPath(membership.clinicId, "order-created"));
}

export async function updateDentalLabOrderStatus(formData: FormData): Promise<never> {
  const parsed = statusSchema.safeParse({
    clinicId: formData.get("clinicId"),
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    trackingReference: formData.get("trackingReference") ?? "",
    remakeReason: formData.get("remakeReason") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "dentalLabManagement");
      const current = await tx.dentalLabOrder.findFirst({
        where: { id: parsed.data.orderId, clinicId: membership.clinicId },
        select: { id: true, status: true },
      });
      if (!current) throw new Error("LAB_ORDER_NOT_FOUND");
      if (!canTransitionDentalLabOrder(current.status, parsed.data.status)) {
        throw new Error("LAB_TRANSITION_NOT_ALLOWED");
      }
      if (parsed.data.status === DentalLabOrderStatus.REMAKE_REQUESTED && !parsed.data.remakeReason?.trim()) {
        throw new Error("REMAKE_REASON_REQUIRED");
      }
      await tx.dentalLabOrder.update({
        where: { id: current.id },
        data: {
          status: parsed.data.status,
          ...(parsed.data.status === DentalLabOrderStatus.SENT_TO_LAB ? { sentAt: new Date() } : {}),
          ...(parsed.data.status === DentalLabOrderStatus.RECEIVED ? { receivedAt: new Date() } : {}),
          ...(parsed.data.trackingReference !== undefined ? { trackingReference: optional(parsed.data.trackingReference) } : {}),
          ...(parsed.data.status === DentalLabOrderStatus.REMAKE_REQUESTED ? { remakeReason: parsed.data.remakeReason!.trim() } : {}),
        },
      });
    });
  } catch (error) {
    if (error instanceof BillingFeatureUnavailableError) redirect(labPath(membership.clinicId, "upgrade-required"));
    if (error instanceof BillingAccessRestrictedError) redirect(labPath(membership.clinicId, "subscription-restricted"));
    if (error instanceof Error && error.message === "LAB_ORDER_NOT_FOUND") redirect(labPath(membership.clinicId, "order-not-found"));
    if (error instanceof Error && error.message === "LAB_TRANSITION_NOT_ALLOWED") redirect(labPath(membership.clinicId, "invalid-transition"));
    if (error instanceof Error && error.message === "REMAKE_REASON_REQUIRED") redirect(labPath(membership.clinicId, "remake-reason-required"));
    console.error("Dental lab order update failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(labPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/lab`);
  redirect(labPath(membership.clinicId, "order-updated"));
}
