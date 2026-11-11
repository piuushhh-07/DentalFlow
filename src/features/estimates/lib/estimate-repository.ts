import "server-only";

import {
  Prisma,
  TreatmentCatalogStatus,
  TreatmentEstimateStatus,
  TreatmentPlanStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  calculateTreatmentEstimateTotals,
  canTransitionTreatmentEstimate,
  type CreateTreatmentEstimateInput,
} from "@/features/estimates/lib/estimate-validation";

export class TreatmentEstimateNotFoundError extends Error {
  constructor() {
    super("The estimate is not available for this patient.");
    this.name = "TreatmentEstimateNotFoundError";
  }
}

export class TreatmentEstimateActorNotAuthorizedError extends Error {
  constructor() {
    super("The estimate actor is not a member of this clinic.");
    this.name = "TreatmentEstimateActorNotAuthorizedError";
  }
}

export class TreatmentEstimateSourceNotFoundError extends Error {
  constructor() {
    super("The selected treatment plan or revision is not available.");
    this.name = "TreatmentEstimateSourceNotFoundError";
  }
}

export class TreatmentEstimateAuthorError extends Error {
  constructor() {
    super("Add your name to your profile before saving an estimate.");
    this.name = "TreatmentEstimateAuthorError";
  }
}

export class TreatmentEstimateProcedureError extends Error {
  constructor() {
    super("A selected procedure is no longer available in this clinic.");
    this.name = "TreatmentEstimateProcedureError";
  }
}

export class TreatmentEstimateTransitionError extends Error {
  constructor(message = "This estimate cannot move to the selected status.") {
    super(message);
    this.name = "TreatmentEstimateTransitionError";
  }
}

export type PatientTreatmentEstimate = Awaited<
  ReturnType<typeof listPatientTreatmentEstimates>
>[number];

function databaseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function clinicDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function todayInTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function listPatientTreatmentEstimates(
  clinicId: string,
  patientId: string,
) {
  return prisma.treatmentEstimate.findMany({
    where: { clinicId, patientId, finalizedAt: { not: null } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    include: {
      treatmentPlan: { select: { id: true, name: true } },
      createdBy: { select: { user: { select: { displayName: true } } } },
      revisionOf: { select: { id: true, version: true } },
      revisions: { select: { id: true, version: true } },
    },
  });
}

export async function listClinicEstimateProcedures(clinicId: string) {
  return prisma.treatmentCatalogueItem.findMany({
    where: { clinicId, status: TreatmentCatalogStatus.ACTIVE },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true, defaultPrice: true },
  });
}

export async function listTreatmentPlanEstimates(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
) {
  return prisma.treatmentEstimate.findMany({
    where: {
      clinicId,
      patientId,
      treatmentPlanId,
      finalizedAt: { not: null },
    },
    orderBy: [{ version: "desc" }],
    include: {
      createdBy: { select: { user: { select: { displayName: true } } } },
      revisionOf: { select: { id: true, version: true } },
      revisions: { select: { id: true, version: true } },
    },
  });
}

export async function getClinicTreatmentEstimate(
  clinicId: string,
  patientId: string,
  estimateId: string,
) {
  return prisma.treatmentEstimate.findFirst({
    where: { id: estimateId, clinicId, patientId, finalizedAt: { not: null } },
    include: {
      patient: { select: { id: true, fullName: true, phoneNumber: true } },
      treatmentPlan: { select: { id: true, name: true } },
      lines: { orderBy: { position: "asc" } },
      clinic: { select: { timeZone: true } },
      createdBy: { select: { user: { select: { displayName: true } } } },
      revisionOf: { select: { id: true, version: true, status: true } },
      revisions: {
        select: { id: true, version: true, status: true },
        orderBy: { version: "asc" },
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

export async function createTreatmentEstimate(
  clinicId: string,
  patientId: string,
  authorUserId: string,
  treatmentPlanId: string,
  input: CreateTreatmentEstimateInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const [patient, clinic, plan, author] = await Promise.all([
        transaction.patient.findFirst({
          where: { id: patientId, clinicId },
          select: { id: true, fullName: true, phoneNumber: true },
        }),
        transaction.clinic.findUnique({
          where: { id: clinicId },
          select: {
            name: true,
            phoneNumber: true,
            contactEmail: true,
            address: true,
            timeZone: true,
          },
        }),
        transaction.treatmentPlan.findFirst({
          where: { id: treatmentPlanId, clinicId, patientId },
          select: { id: true, status: true },
        }),
        transaction.clinicMembership.findFirst({
          where: { userId: authorUserId, clinicId, revokedAt: null },
          select: { user: { select: { displayName: true } } },
        }),
      ]);
      if (
        !patient ||
        !clinic ||
        !plan ||
        plan.status === TreatmentPlanStatus.CANCELLED
      ) {
        throw new TreatmentEstimateSourceNotFoundError();
      }
      if (!author) throw new TreatmentEstimateSourceNotFoundError();
      const dentistName = author.user.displayName?.trim();
      if (!dentistName) throw new TreatmentEstimateAuthorError();

      let revision:
        | {
            id: string;
            treatmentPlanId: string;
          }
        | undefined;
      if (input.revisionOfEstimateId) {
        revision =
          (await transaction.treatmentEstimate.findFirst({
            where: {
              id: input.revisionOfEstimateId,
              clinicId,
              patientId,
              treatmentPlanId,
              finalizedAt: { not: null },
              revisions: { none: {} },
            },
            select: { id: true, treatmentPlanId: true },
          })) ?? undefined;
        if (!revision) throw new TreatmentEstimateSourceNotFoundError();
      }

      const catalogueIds = input.lines
        .map((line) => line.catalogueItemId)
        .filter((id): id is string => Boolean(id));
      const procedures = catalogueIds.length
        ? await transaction.treatmentCatalogueItem.findMany({
            where: {
              id: { in: catalogueIds },
              clinicId,
              status: TreatmentCatalogStatus.ACTIVE,
            },
            select: { id: true },
          })
        : [];
      if (procedures.length !== new Set(catalogueIds).size) {
        throw new TreatmentEstimateProcedureError();
      }

      const lines = input.lines.map((line) => ({
        ...line,
        catalogueItemId: line.catalogueItemId || null,
      }));
      const totals = calculateTreatmentEstimateTotals(
        lines,
        input.discountAmount,
        input.taxRate,
      );

      const versionAggregate = await transaction.treatmentEstimate.aggregate({
        where: { clinicId, patientId, treatmentPlanId },
        _max: { version: true },
      });
      const estimate = await transaction.treatmentEstimate.create({
        data: {
          clinicId,
          patientId,
          treatmentPlanId,
          createdByUserId: authorUserId,
          revisionOfEstimateId: revision?.id ?? null,
          revisionReason: revision ? input.revisionReason?.trim() : null,
          version: (versionAggregate._max.version ?? 0) + 1,
          estimateDate: databaseDate(input.estimateDate),
          validityDate: databaseDate(input.validityDate),
          subtotal: new Prisma.Decimal(totals.subtotal),
          discountAmount: new Prisma.Decimal(totals.discountAmount),
          taxRate: new Prisma.Decimal(totals.taxRate),
          taxAmount: new Prisma.Decimal(totals.taxAmount),
          totalAmount: new Prisma.Decimal(totals.totalAmount),
          notes: input.notes?.trim() || null,
          terms: input.terms?.trim() || null,
          clinicNameSnapshot: clinic.name,
          clinicPhoneSnapshot: clinic.phoneNumber,
          clinicEmailSnapshot: clinic.contactEmail,
          clinicAddressSnapshot: clinic.address,
          patientNameSnapshot: patient.fullName,
          patientPhoneSnapshot: patient.phoneNumber,
          dentistNameSnapshot: dentistName,
          dentistRegistrationSnapshot:
            input.dentistRegistrationNumber?.trim() || null,
          lines: {
            create: lines.map((line, position) => ({
              clinicId,
              patientId,
              catalogueItemId: line.catalogueItemId,
              position,
              description: line.description,
              quantity: line.quantity,
              unitPrice: new Prisma.Decimal(line.unitPrice),
              lineTotal: new Prisma.Decimal(totals.lineTotals[position]),
            })),
          },
        },
        select: { id: true },
      });
      await transaction.treatmentEstimateAudit.create({
        data: {
          clinicId,
          patientId,
          estimateId: estimate.id,
          actorUserId: authorUserId,
          actorNameSnapshot: dentistName,
          action: revision ? "REVISED" : "CREATED",
          toStatus: TreatmentEstimateStatus.DRAFT,
          note: revision ? input.revisionReason?.trim() : null,
        },
      });
      await transaction.treatmentEstimate.update({
        where: { id: estimate.id },
        data: { finalizedAt: new Date() },
      });
      return estimate;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

export async function transitionTreatmentEstimate(
  clinicId: string,
  patientId: string,
  estimateId: string,
  actorUserId: string,
  nextStatus: TreatmentEstimateStatus,
  note?: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const [estimate, actor] = await Promise.all([
        transaction.treatmentEstimate.findFirst({
          where: {
            id: estimateId,
            clinicId,
            patientId,
            finalizedAt: { not: null },
          },
          select: {
            id: true,
            treatmentPlanId: true,
            status: true,
            validityDate: true,
            clinic: { select: { timeZone: true } },
          },
        }),
        transaction.clinicMembership.findUnique({
          where: { userId_clinicId: { userId: actorUserId, clinicId } },
          select: {
            userId: true,
            user: { select: { displayName: true } },
          },
        }),
      ]);
      if (!estimate) throw new TreatmentEstimateNotFoundError();
      if (!actor) throw new TreatmentEstimateActorNotAuthorizedError();
      const validityDate = clinicDate(estimate.validityDate);
      const today = todayInTimeZone(estimate.clinic.timeZone);
      if (
        !canTransitionTreatmentEstimate(
          estimate.status,
          nextStatus,
          validityDate,
          today,
        )
      ) {
        throw new TreatmentEstimateTransitionError(
          estimate.status === TreatmentEstimateStatus.SENT &&
            validityDate < today &&
            nextStatus !== TreatmentEstimateStatus.EXPIRED
            ? "This quotation has expired and cannot be accepted or rejected."
            : undefined,
        );
      }

      await transaction.treatmentEstimate.update({
        where: { id: estimate.id },
        data: { status: nextStatus },
      });
      await transaction.treatmentEstimateAudit.create({
        data: {
          clinicId,
          patientId,
          estimateId,
          actorUserId,
          actorNameSnapshot: actor.user.displayName?.trim() || null,
          action: "STATUS_CHANGED",
          fromStatus: estimate.status,
          toStatus: nextStatus,
          note: note?.trim() || null,
        },
      });
      return { treatmentPlanId: estimate.treatmentPlanId };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}
