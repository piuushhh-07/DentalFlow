"use server";

import { ClinicRole, InstrumentPouchStatus, Prisma, SterilisationCycleResult } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { assertFeatureEnabled, BillingAccessRestrictedError, BillingFeatureUnavailableError } from "@/features/billing/lib/billing-entitlements";
import { canCreatePouch, canMarkCycleSuccessful, canUsePouch } from "@/features/sterilisation/workflow";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const cycleSchema = z.object({
  clinicId: uuid,
  loadReference: z.string().trim().min(2).max(80),
  sterilizerName: z.string().trim().min(2).max(120),
  loadDescription: z.string().trim().min(2).max(500),
  notes: z.string().trim().max(1000).optional(),
});
const resultSchema = z.object({
  clinicId: uuid,
  cycleId: uuid,
  temperatureC: z.coerce.number().finite().min(0).max(300),
  pressureBar: z.coerce.number().finite().min(0).max(30),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  chemicalIndicatorPass: z.enum(["true", "false"]).transform((v) => v === "true"),
  biologicalIndicatorPass: z.enum(["true", "false"]).transform((v) => v === "true"),
  result: z.enum(["PASS", "FAIL"]),
  resultNotes: z.string().trim().max(1000).optional(),
});
const pouchSchema = z.object({
  clinicId: uuid,
  cycleId: uuid,
  pouchCode: z.string().trim().min(2).max(80),
  contents: z.string().trim().min(2).max(500),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const pouchStatusSchema = z.object({
  clinicId: uuid,
  pouchId: uuid,
  status: z.enum(["USED", "QUARANTINED"]),
});
const logSchema = z.object({
  clinicId: uuid,
  recordType: z.enum(["SURFACE_DISINFECTION", "HAND_HYGIENE", "PPE_CHECK", "BIOMEDICAL_WASTE", "SHARPS_DISPOSAL", "INCIDENT", "OTHER"]),
  area: z.string().trim().min(2).max(120),
  details: z.string().trim().min(2).max(2000),
  outcome: z.string().trim().max(500).optional(),
});

function pagePath(clinicId: string, status: string) {
  return `/clinic/${clinicId}/sterilisation?status=${status}`;
}
function handleError(clinicId: string, error: unknown): never {
  if (error instanceof BillingFeatureUnavailableError) redirect(pagePath(clinicId, "upgrade-required"));
  if (error instanceof BillingAccessRestrictedError) redirect(pagePath(clinicId, "subscription-restricted"));
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect(pagePath(clinicId, "duplicate"));
  console.error("Sterilisation workflow failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  redirect(pagePath(clinicId, "error"));
}

export async function createSterilisationCycle(formData: FormData): Promise<never> {
  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "sterilisationTracking");
      await tx.sterilisationCycle.create({ data: {
        clinicId: membership.clinicId, operatorUserId: membership.userId,
        loadReference: parsed.data.loadReference, sterilizerName: parsed.data.sterilizerName,
        loadDescription: parsed.data.loadDescription, notes: parsed.data.notes?.trim() || null,
      }});
    });
  } catch (error) { handleError(membership.clinicId, error); }
  revalidatePath(`/clinic/${membership.clinicId}/sterilisation`);
  redirect(pagePath(membership.clinicId, "cycle-created"));
}

export async function recordSterilisationCycleResult(formData: FormData): Promise<never> {
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  if (parsed.data.result === "PASS" && !canMarkCycleSuccessful(parsed.data)) redirect(pagePath(parsed.data.clinicId, "indicators-must-pass"));
  if (parsed.data.result === "FAIL" && !parsed.data.resultNotes?.trim()) redirect(pagePath(parsed.data.clinicId, "failure-reason-required"));
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "sterilisationTracking");
      const updated = await tx.sterilisationCycle.updateMany({
        where: { id: parsed.data.cycleId, clinicId: membership.clinicId, result: SterilisationCycleResult.PENDING },
        data: {
          result: parsed.data.result as SterilisationCycleResult,
          completedAt: new Date(),
          temperatureC: new Prisma.Decimal(parsed.data.temperatureC),
          pressureBar: new Prisma.Decimal(parsed.data.pressureBar),
          durationMinutes: parsed.data.durationMinutes,
          chemicalIndicatorPass: parsed.data.chemicalIndicatorPass,
          biologicalIndicatorPass: parsed.data.biologicalIndicatorPass,
          ...(parsed.data.resultNotes?.trim() ? { notes: parsed.data.resultNotes.trim() } : {}),
        },
      });
      if (updated.count !== 1) throw new Error("CYCLE_NOT_PENDING");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CYCLE_NOT_PENDING") redirect(pagePath(membership.clinicId, "cycle-already-final"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/sterilisation`);
  redirect(pagePath(membership.clinicId, "cycle-updated"));
}

export async function createInstrumentPouch(formData: FormData): Promise<never> {
  const parsed = pouchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const expiry = new Date(`${parsed.data.expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== parsed.data.expiresAt) redirect(pagePath(membership.clinicId, "invalid-expiry"));
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "sterilisationTracking");
      const cycle = await tx.sterilisationCycle.findFirst({
        where: { id: parsed.data.cycleId, clinicId: membership.clinicId },
        select: { id: true, result: true },
      });
      if (!cycle || !canCreatePouch(cycle.result, expiry)) throw new Error("CYCLE_NOT_PASSED");
      await tx.instrumentPouch.create({ data: {
        clinicId: membership.clinicId, cycleId: cycle.id, pouchCode: parsed.data.pouchCode,
        contents: parsed.data.contents, expiresAt: expiry,
      }});
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CYCLE_NOT_PASSED") redirect(pagePath(membership.clinicId, "cycle-not-passed"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/sterilisation`);
  redirect(pagePath(membership.clinicId, "pouch-created"));
}

export async function updateInstrumentPouchStatus(formData: FormData): Promise<never> {
  const parsed = pouchStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "sterilisationTracking");
      const pouch = await tx.instrumentPouch.findFirst({
        where: { id: parsed.data.pouchId, clinicId: membership.clinicId },
        select: { id: true, status: true, expiresAt: true },
      });
      if (!pouch) throw new Error("POUCH_NOT_FOUND");
      if (parsed.data.status === "USED" && !canUsePouch(pouch.status, pouch.expiresAt)) throw new Error("POUCH_NOT_USABLE");
      if (pouch.status !== InstrumentPouchStatus.STERILE) throw new Error("POUCH_NOT_STERILE");
      const update = await tx.instrumentPouch.updateMany({
        where: { id: pouch.id, clinicId: membership.clinicId, status: InstrumentPouchStatus.STERILE },
        data: parsed.data.status === "USED"
          ? { status: InstrumentPouchStatus.USED, usedAt: new Date(), usedByUserId: membership.userId }
          : { status: InstrumentPouchStatus.QUARANTINED },
      });
      if (update.count !== 1) throw new Error("POUCH_STATE_CONFLICT");
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "POUCH_NOT_USABLE" || error.message === "POUCH_NOT_STERILE" || error.message === "POUCH_STATE_CONFLICT")) redirect(pagePath(membership.clinicId, "pouch-not-usable"));
    if (error instanceof Error && error.message === "POUCH_NOT_FOUND") redirect(pagePath(membership.clinicId, "pouch-not-found"));
    handleError(membership.clinicId, error);
  }
  revalidatePath(`/clinic/${membership.clinicId}/sterilisation`);
  redirect(pagePath(membership.clinicId, "pouch-updated"));
}

export async function createInfectionControlLog(formData: FormData): Promise<never> {
  const parsed = logSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  try {
    await prisma.$transaction(async (tx) => {
      await assertFeatureEnabled(tx, membership.clinicId, "sterilisationTracking");
      await tx.infectionControlLog.create({ data: {
        clinicId: membership.clinicId, recordedByUserId: membership.userId,
        recordType: parsed.data.recordType, area: parsed.data.area, details: parsed.data.details,
        outcome: parsed.data.outcome?.trim() || null,
      }});
    });
  } catch (error) { handleError(membership.clinicId, error); }
  revalidatePath(`/clinic/${membership.clinicId}/sterilisation`);
  redirect(pagePath(membership.clinicId, "log-created"));
}
