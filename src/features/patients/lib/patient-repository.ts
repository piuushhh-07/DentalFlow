import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertPatientCapacity } from "@/features/billing/lib/billing-entitlements";
import {
  getPatientPagination,
  resolvePatientEnabledAtTimestamp,
  PATIENT_PAGE_SIZE,
  patientBelongsToClinic,
  type PatientInput,
} from "@/features/patients/lib/patient-validation";

export async function listClinicPatients(
  clinicId: string,
  query: string,
  requestedPage: number,
) {
  const where: Prisma.PatientWhereInput = {
    clinicId,
    ...(query
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            ...(query.replace(/\D/g, "")
              ? [
                  {
                    normalizedPhone: {
                      contains: query.replace(/\D/g, ""),
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
  };

  const requestedSkip = (Math.max(1, requestedPage) - 1) * PATIENT_PAGE_SIZE;
  const [totalCount, firstPageResult] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
      skip: requestedSkip,
      take: PATIENT_PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        whatsappOptIn: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const pagination = getPatientPagination(totalCount, requestedPage);
  const patients =
    pagination.skip === requestedSkip
      ? firstPageResult
      : await prisma.patient.findMany({
          where,
          orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
          skip: pagination.skip,
          take: pagination.pageSize,
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            whatsappOptIn: true,
            createdAt: true,
            updatedAt: true,
          },
        });

  return { patients, pagination };
}

export async function getClinicPatient(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: {
      id: true,
      clinicId: true,
      fullName: true,
      phoneNumber: true,
      normalizedPhone: true,
      email: true,
      normalizedEmail: true,
      portalAccessEnabled: true,
      portalAccessEnabledAt: true,
      whatsappOptIn: true,
      whatsappOptedInAt: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return patientBelongsToClinic(patient, clinicId) ? patient : null;
}

export async function createClinicPatient(
  clinicId: string,
  input: PatientInput,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          await assertPatientCapacity(transaction, clinicId);
          return transaction.patient.create({
            data: {
              clinicId,
              fullName: input.fullName,
              phoneNumber: input.phoneNumber,
              normalizedPhone: input.phoneNumber,
              email: input.email,
              normalizedEmail: input.email,
              portalAccessEnabled: input.portalAccessEnabled,
              portalAccessEnabledAt: input.portalAccessEnabledAt,
              whatsappOptIn: input.whatsappOptIn,
              whatsappOptedInAt: input.whatsappOptedInAt,
              notes: input.notes,
            },
            select: { id: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Patient creation retry limit exceeded.");
}

export async function updateClinicPatient(
  clinicId: string,
  patientId: string,
  input: PatientInput,
) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.patient.findFirst({
      where: { id: patientId, clinicId },
      select: {
        portalAccessEnabled: true,
        portalAccessEnabledAt: true,
        whatsappOptIn: true,
        whatsappOptedInAt: true,
      },
    });
    if (!existing) return false;

    const result = await transaction.patient.updateMany({
      where: { id: patientId, clinicId },
      data: {
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        normalizedPhone: input.phoneNumber,
        email: input.email,
        normalizedEmail: input.email,
        portalAccessEnabled: input.portalAccessEnabled,
        portalAccessEnabledAt: resolvePatientEnabledAtTimestamp(
          input.portalAccessEnabled,
          existing.portalAccessEnabled,
          existing.portalAccessEnabledAt,
          input.portalAccessEnabledAt ?? new Date(),
        ),
        whatsappOptIn: input.whatsappOptIn,
        whatsappOptedInAt: resolvePatientEnabledAtTimestamp(
          input.whatsappOptIn,
          existing.whatsappOptIn,
          existing.whatsappOptedInAt,
          input.whatsappOptedInAt ?? new Date(),
        ),
        notes: input.notes,
      },
    });

    return result.count > 0;
  });
}

export async function deleteClinicPatient(clinicId: string, patientId: string) {
  const result = await prisma.patient.deleteMany({
    where: {
      id: patientId,
      clinicId,
      treatmentPlans: { none: {} },
      treatmentFinancialEntries: { none: {} },
      treatmentEstimates: { none: {} },
      appointments: { none: {} },
      preventiveRecalls: { none: {} },
      messageLogs: { none: {} },
      insurancePolicies: { none: {} },
      insuranceClaims: { none: {} },
      insurancePreAuthorizations: { none: {} },
      odontogramEntries: { none: {} },
      dentalClinicalRecords: { none: {} },
      digitalPrescriptions: { none: {} },
      dataExportAudits: { none: {} },
    },
  });

  return result.count > 0;
}
