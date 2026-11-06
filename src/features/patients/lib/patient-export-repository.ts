import "server-only";

import { prisma } from "@/lib/db/prisma";

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
      insurancePolicies: true,
      insuranceClaims: true,
      insurancePreAuthorizations: true,
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
    exportedAt: new Date().toISOString(),
    patient,
  };
}
