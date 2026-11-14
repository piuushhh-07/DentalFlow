import "server-only";

import { ClinicalRecordAuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { DentalClinicalRecordInput } from "@/features/clinical-records/lib/clinical-record-validation";

export class DentalClinicalRecordPatientNotFoundError extends Error {
  constructor() {
    super("The patient is not available in this clinic.");
    this.name = "DentalClinicalRecordPatientNotFoundError";
  }
}

export class DentalClinicalRecordVisitNotFoundError extends Error {
  constructor() {
    super("The selected visit is not available for this patient.");
    this.name = "DentalClinicalRecordVisitNotFoundError";
  }
}

export class DentalClinicalRecordFindingNotFoundError extends Error {
  constructor() {
    super("The linked tooth finding is not available in this chart.");
    this.name = "DentalClinicalRecordFindingNotFoundError";
  }
}

export type DentalClinicalRecord = Awaited<
  ReturnType<typeof listPatientDentalClinicalRecords>
>[number];

export async function listPatientDentalClinicalRecords(
  clinicId: string,
  patientId: string,
) {
  return prisma.dentalClinicalRecord.findMany({
    where: { clinicId, patientId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      createdBy: {
        select: { user: { select: { displayName: true } } },
      },
      visit: {
        select: {
          id: true,
          visitNumber: true,
          dueDate: true,
          status: true,
          treatmentPlan: { select: { id: true, name: true } },
        },
      },
      findings: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          relatedOdontogramEntry: {
            select: {
              id: true,
              toothNumber: true,
              dentition: true,
              entryType: true,
              finding: true,
            },
          },
        },
      },
      audits: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      },
    },
  });
}

export async function createDentalClinicalRecord(
  clinicId: string,
  patientId: string,
  createdByUserId: string,
  input: DentalClinicalRecordInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const patient = await transaction.patient.findFirst({
        where: { id: patientId, clinicId, archivedAt: null },
        select: { id: true },
      });

      if (!patient) {
        throw new DentalClinicalRecordPatientNotFoundError();
      }

      if (input.visitId) {
        const visit = await transaction.treatmentVisit.findFirst({
          where: { id: input.visitId, clinicId, patientId },
          select: { id: true },
        });

        if (!visit) {
          throw new DentalClinicalRecordVisitNotFoundError();
        }
      }

      const record = await transaction.dentalClinicalRecord.create({
        data: {
          clinicId,
          patientId,
          visitId: input.visitId ?? null,
          createdByUserId,
          medicalHistory: input.medicalHistory ?? null,
          dentalHistory: input.dentalHistory ?? null,
          allergies: input.allergies ?? null,
          chiefComplaints: input.chiefComplaints,
          clinicalExamination: input.clinicalExamination,
          diagnosis: input.diagnosis ?? null,
          treatmentRecommendations: input.treatmentRecommendations ?? null,
          clinicalNotes: input.clinicalNotes ?? null,
        },
        select: { id: true },
      });

      for (const finding of input.findings) {
        if (finding.relatedOdontogramEntryId) {
          const linkedEntry = await transaction.odontogramEntry.findFirst({
            where: {
              id: finding.relatedOdontogramEntryId,
              clinicId,
              patientId,
            },
            select: { id: true },
          });

          if (!linkedEntry) {
            throw new DentalClinicalRecordFindingNotFoundError();
          }
        }

        await transaction.dentalClinicalRecordFinding.create({
          data: {
            clinicId,
            patientId,
            recordId: record.id,
            toothNumber: finding.toothNumber ?? null,
            dentition: finding.dentition ?? null,
            toothFindingLabel: finding.toothFindingLabel ?? null,
            summary: finding.summary ?? null,
            surfaces: finding.surfaces,
            notes: finding.notes ?? null,
            relatedOdontogramEntryId: finding.relatedOdontogramEntryId ?? null,
          },
        });
      }

      await transaction.dentalClinicalRecordAudit.create({
        data: {
          clinicId,
          patientId,
          recordId: record.id,
          changedByUserId: createdByUserId,
          action: ClinicalRecordAuditAction.CREATED,
          note: "Clinical record created.",
        },
      });

      return record;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
