import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { OdontogramEntryInput } from "@/features/odontogram/lib/odontogram-validation";

export class OdontogramPatientNotFoundError extends Error {
  constructor() {
    super("The patient is not available in this clinic.");
    this.name = "OdontogramPatientNotFoundError";
  }
}

export class OdontogramTreatmentPlanNotFoundError extends Error {
  constructor() {
    super("The treatment plan is not available for this patient.");
    this.name = "OdontogramTreatmentPlanNotFoundError";
  }
}

export class OdontogramCorrectionNotFoundError extends Error {
  constructor() {
    super("The entry to correct is not available for this tooth.");
    this.name = "OdontogramCorrectionNotFoundError";
  }
}

export class OdontogramCorrectionConflictError extends Error {
  constructor() {
    super("This entry was already corrected. Refresh the chart and try again.");
    this.name = "OdontogramCorrectionConflictError";
  }
}

export async function listPatientOdontogramEntries(
  clinicId: string,
  patientId: string,
) {
  return prisma.odontogramEntry.findMany({
    where: { clinicId, patientId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      recordedBy: {
        select: { user: { select: { displayName: true } } },
      },
      supersededBy: { select: { id: true } },
      treatmentPlan: { select: { id: true, name: true } },
    },
  });
}

export async function listPatientOdontogramTreatmentPlans(
  clinicId: string,
  patientId: string,
) {
  return prisma.treatmentPlan.findMany({
    where: { clinicId, patientId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, name: true },
  });
}

export async function createPatientOdontogramEntry(
  clinicId: string,
  patientId: string,
  createdByUserId: string,
  input: OdontogramEntryInput,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const patient = await transaction.patient.findFirst({
          where: { id: patientId, clinicId, archivedAt: null },
          select: { id: true },
        });
        if (!patient) {
          throw new OdontogramPatientNotFoundError();
        }

        if (input.treatmentPlanId) {
          const plan = await transaction.treatmentPlan.findFirst({
            where: {
              id: input.treatmentPlanId,
              clinicId,
              patientId,
            },
            select: { id: true },
          });
          if (!plan) {
            throw new OdontogramTreatmentPlanNotFoundError();
          }
        }

        if (input.supersedesEntryId) {
          const entry = await transaction.odontogramEntry.findFirst({
            where: {
              id: input.supersedesEntryId,
              clinicId,
              patientId,
              toothNumber: input.toothNumber,
              dentition: input.dentition,
              entryType: input.entryType,
              supersededBy: { is: null },
            },
            select: { id: true },
          });
          if (!entry) {
            throw new OdontogramCorrectionNotFoundError();
          }
        }

        return transaction.odontogramEntry.create({
          data: {
            clinicId,
            patientId,
            createdByUserId,
            toothNumber: input.toothNumber,
            dentition: input.dentition,
            entryType: input.entryType,
            finding: input.finding ?? null,
            treatmentName: input.treatmentName ?? null,
            treatmentStatus: input.treatmentStatus ?? null,
            surfaces: input.surfaces,
            notes: input.notes ?? null,
            treatmentPlanId: input.treatmentPlanId ?? null,
            supersedesEntryId: input.supersedesEntryId ?? null,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      input.supersedesEntryId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      throw new OdontogramCorrectionConflictError();
    }

    throw error;
  }
}
