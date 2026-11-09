import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CreatePrescriptionInput } from "@/features/prescriptions/lib/prescription-validation";

export class PrescriptionPatientNotFoundError extends Error {
  constructor() {
    super("The patient is not available in this clinic.");
    this.name = "PrescriptionPatientNotFoundError";
  }
}

export class PrescriptionVisitNotFoundError extends Error {
  constructor() {
    super("The selected visit is not available for this patient.");
    this.name = "PrescriptionVisitNotFoundError";
  }
}

export class PrescriptionOriginalNotFoundError extends Error {
  constructor() {
    super("The prescription to amend is not available for this patient.");
    this.name = "PrescriptionOriginalNotFoundError";
  }
}

export class PrescriptionAlreadyAmendedError extends Error {
  constructor() {
    super(
      "This prescription already has a correction. Amend the latest version.",
    );
    this.name = "PrescriptionAlreadyAmendedError";
  }
}

export class PrescriptionCatalogueItemNotFoundError extends Error {
  constructor() {
    super(
      "A selected medicine catalogue item is not available in this clinic.",
    );
    this.name = "PrescriptionCatalogueItemNotFoundError";
  }
}

export class PrescriptionAuthorProfileIncompleteError extends Error {
  constructor() {
    super("A dentist name is required to identify the prescription author.");
    this.name = "PrescriptionAuthorProfileIncompleteError";
  }
}

export type PatientDigitalPrescription = Awaited<
  ReturnType<typeof listPatientPrescriptions>
>[number];

export async function listPatientPrescriptions(
  clinicId: string,
  patientId: string,
) {
  return prisma.digitalPrescription.findMany({
    where: { clinicId, patientId, finalizedAt: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      medicines: { orderBy: { position: "asc" } },
      author: { select: { user: { select: { displayName: true } } } },
      visit: {
        select: {
          id: true,
          visitNumber: true,
          treatmentPlan: { select: { name: true } },
        },
      },
      amendsPrescription: { select: { id: true, prescriptionDate: true } },
      amendments: { select: { id: true, prescriptionDate: true } },
      audits: {
        orderBy: { createdAt: "asc" },
        include: {
          actor: { select: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function listClinicPrescriptionMedicineCatalogue(
  clinicId: string,
) {
  return prisma.prescriptionMedicineCatalogueItem.findMany({
    where: { clinicId },
    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
    select: { id: true, name: true, strength: true, form: true },
  });
}

export async function getClinicPrescription(
  clinicId: string,
  patientId: string,
  prescriptionId: string,
) {
  return prisma.digitalPrescription.findFirst({
    where: {
      id: prescriptionId,
      clinicId,
      patientId,
      finalizedAt: { not: null },
    },
    include: {
      patient: { select: { id: true, fullName: true } },
      medicines: { orderBy: { position: "asc" } },
      visit: {
        select: {
          id: true,
          visitNumber: true,
          treatmentPlan: { select: { name: true } },
        },
      },
      amendsPrescription: {
        select: { id: true, prescriptionDate: true, createdAt: true },
      },
      amendments: {
        select: { id: true, prescriptionDate: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      audits: {
        orderBy: { createdAt: "asc" },
        include: {
          actor: { select: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function createDigitalPrescription(
  clinicId: string,
  patientId: string,
  authorUserId: string,
  input: CreatePrescriptionInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const [patient, clinic, authorMembership] = await Promise.all([
        transaction.patient.findFirst({
          where: { id: patientId, clinicId },
          select: { id: true },
        }),
        transaction.clinic.findUnique({
          where: { id: clinicId },
          select: {
            name: true,
            phoneNumber: true,
            contactEmail: true,
            address: true,
          },
        }),
        transaction.clinicMembership.findFirst({
          where: { userId: authorUserId, clinicId, revokedAt: null },
          select: { user: { select: { displayName: true } } },
        }),
      ]);

      if (!patient || !clinic || !authorMembership) {
        throw new PrescriptionPatientNotFoundError();
      }
      const authorName = authorMembership.user.displayName?.trim();
      if (!authorName) {
        throw new PrescriptionAuthorProfileIncompleteError();
      }

      let originalPrescription:
        | {
            id: string;
            visitId: string | null;
            authorRegistrationSnapshot: string | null;
            amendments: { id: string }[];
          }
        | undefined;
      if (input.amendsPrescriptionId) {
        originalPrescription =
          (await transaction.digitalPrescription.findFirst({
            where: {
              id: input.amendsPrescriptionId,
              clinicId,
              patientId,
              finalizedAt: { not: null },
            },
            select: {
              id: true,
              visitId: true,
              authorRegistrationSnapshot: true,
              amendments: { select: { id: true }, take: 1 },
            },
          })) ?? undefined;
        if (!originalPrescription) {
          throw new PrescriptionOriginalNotFoundError();
        }
        if (originalPrescription.amendments.length) {
          throw new PrescriptionAlreadyAmendedError();
        }
      }

      const visitId = input.visitId ?? originalPrescription?.visitId ?? null;
      if (visitId) {
        const visit = await transaction.treatmentVisit.findFirst({
          where: { id: visitId, clinicId, patientId },
          select: { id: true },
        });
        if (!visit) throw new PrescriptionVisitNotFoundError();
      }

      const catalogueIds = input.medicines
        .map((medicine) => medicine.catalogueItemId)
        .filter((id): id is string => Boolean(id));
      const catalogueItems = catalogueIds.length
        ? await transaction.prescriptionMedicineCatalogueItem.findMany({
            where: { id: { in: catalogueIds }, clinicId },
            select: { id: true, name: true, strength: true, form: true },
          })
        : [];
      if (catalogueItems.length !== catalogueIds.length) {
        throw new PrescriptionCatalogueItemNotFoundError();
      }
      const catalogueById = new Map(
        catalogueItems.map((item) => [item.id, item]),
      );

      const registrationNumber =
        input.authorRegistrationNumber ??
        originalPrescription?.authorRegistrationSnapshot ??
        null;
      const prescription = await transaction.digitalPrescription.create({
        data: {
          clinicId,
          patientId,
          visitId,
          authorUserId,
          amendsPrescriptionId: originalPrescription?.id ?? null,
          amendmentReason: input.amendmentReason ?? null,
          prescriptionDate: new Date(`${input.prescriptionDate}T00:00:00.000Z`),
          diagnosisNotes: input.diagnosisNotes ?? null,
          additionalAdvice: input.additionalAdvice ?? null,
          followUpDate: input.followUpDate
            ? new Date(`${input.followUpDate}T00:00:00.000Z`)
            : null,
          clinicNameSnapshot: clinic.name,
          clinicPhoneSnapshot: clinic.phoneNumber,
          clinicEmailSnapshot: clinic.contactEmail,
          clinicAddressSnapshot: clinic.address,
          authorNameSnapshot: authorName,
          authorRegistrationSnapshot: registrationNumber,
          authorConfirmedAt: new Date(),
          medicines: {
            create: input.medicines.map((medicine, position) => {
              const catalogueItem = medicine.catalogueItemId
                ? catalogueById.get(medicine.catalogueItemId)
                : undefined;
              const name = catalogueItem
                ? [catalogueItem.name, catalogueItem.strength]
                    .filter(Boolean)
                    .join(" ")
                : medicine.medicineName;
              return {
                clinicId,
                patientId,
                catalogueItemId: catalogueItem?.id ?? null,
                position,
                medicineName: name,
                dosage: medicine.dosage,
                route: medicine.route,
                frequency: medicine.frequency,
                duration: medicine.duration,
                quantity: medicine.quantity,
                instructions: medicine.instructions ?? null,
              };
            }),
          },
        },
        select: { id: true },
      });

      await transaction.digitalPrescriptionAudit.create({
        data: {
          clinicId,
          patientId,
          prescriptionId: prescription.id,
          actorUserId: authorUserId,
          action: originalPrescription ? "AMENDED" : "CREATED",
          note: input.amendmentReason ?? null,
        },
      });

      if (input.saveToCatalogue) {
        const names = new Map<
          string,
          { name: string; strength: string | null }
        >();
        for (const medicine of input.medicines) {
          if (medicine.catalogueItemId) continue;
          const name = medicine.medicineName.trim();
          const normalizedName = name.toLocaleLowerCase("en-IN");
          names.set(normalizedName, { name, strength: null });
        }
        for (const [normalizedName, item] of Array.from(names.entries())) {
          await transaction.prescriptionMedicineCatalogueItem.upsert({
            where: { clinicId_normalizedName: { clinicId, normalizedName } },
            create: {
              clinicId,
              createdByUserId: authorUserId,
              name: item.name,
              normalizedName,
            },
            update: {},
          });
        }
      }

      await transaction.digitalPrescription.update({
        where: { id: prescription.id },
        data: { finalizedAt: new Date() },
      });

      return prescription;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
