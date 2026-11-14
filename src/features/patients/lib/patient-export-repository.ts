import "server-only";

import { prisma } from "@/lib/db/prisma";

export const PATIENT_EXPORT_FORMAT_VERSION = 2;

export async function exportClinicPatientData(
  clinicId: string,
  patientId: string,
  actorUserId: string,
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    include: {
      treatmentPlans: { include: { visits: true } },
      treatmentFinancialEntries: true,
      treatmentEstimates: { include: { lines: true, audits: true } },
      appointments: true,
      preventiveRecalls: true,
      messageLogs: true,
      insurancePolicies: {
        include: {
          provider: { select: { id: true, name: true, kind: true } },
          activities: true,
        },
      },
      insuranceClaims: {
        include: {
          payments: true,
          activities: true,
          documents: {
            select: {
              id: true,
              clinicId: true,
              claimId: true,
              type: true,
              name: true,
              status: true,
              receivedAt: true,
              verifiedAt: true,
              rejectionReason: true,
              extractionStatus: true,
              extractionData: true,
              extractionIssues: true,
              extractionCompletedAt: true,
              extractionModel: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      insurancePreAuthorizations: { include: { activities: true } },
      odontogramEntries: true,
      dentalClinicalRecords: { include: { findings: true, audits: true } },
      digitalPrescriptions: { include: { medicines: true, audits: true } },
    },
  });
  if (!patient) return null;

  await prisma.patientDataExportAudit.create({
    data: {
      clinicId,
      patientId,
      actorUserId,
    },
    select: { id: true },
  });

  return {
    format: "dentalflow.patient-data-export",
    formatVersion: PATIENT_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    scope: {
      clinicScoped: true,
      includesStructuredRecords: true,
      includesPrivateStorageFileContents: false,
      excludesPrivateStoragePaths: true,
      excludesExportAuditHistory: true,
    },
    patient,
  };
}
