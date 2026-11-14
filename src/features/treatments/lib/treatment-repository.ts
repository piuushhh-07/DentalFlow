import "server-only";

import {
  AppointmentStatus,
  Prisma,
  TreatmentPlanStatus,
  TreatmentVisitStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  measureTransactionQuery,
  recordTransactionPhase,
  startTransactionDiagnostic,
  type TransactionDiagnostic,
} from "@/lib/db/transaction-diagnostics";
import {
  canTransitionTreatmentVisit,
  toDatabaseDate,
  validateAdditionalVisits,
  type CreateTreatmentPlanInput,
  type UpdateTreatmentPlanInput,
} from "@/features/treatments/lib/treatment-validation";

export class TreatmentPatientNotFoundError extends Error {
  constructor() {
    super("The selected patient is not available in this clinic.");
    this.name = "TreatmentPatientNotFoundError";
  }
}

export class TreatmentPlanNotFoundError extends Error {
  constructor() {
    super("The treatment plan is not available in this clinic.");
    this.name = "TreatmentPlanNotFoundError";
  }
}

export class TreatmentVisitNotFoundError extends Error {
  constructor() {
    super("The visit is not available in this clinic.");
    this.name = "TreatmentVisitNotFoundError";
  }
}

export class TreatmentPlanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreatmentPlanStateError";
  }
}

export class TreatmentVisitTransitionError extends Error {
  constructor() {
    super("This visit can no longer move to the selected status.");
    this.name = "TreatmentVisitTransitionError";
  }
}

export async function listPatientTreatmentPlans(
  clinicId: string,
  patientId: string,
) {
  return prisma.treatmentPlan.findMany({
    where: { clinicId, patientId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      visits: {
        orderBy: { visitNumber: "asc" },
        select: {
          id: true,
          visitNumber: true,
          dueDate: true,
          status: true,
          completedAt: true,
          notes: true,
        },
      },
    },
  });
}

export async function getClinicTreatmentPlan(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
) {
  return prisma.treatmentPlan.findFirst({
    where: { id: treatmentPlanId, clinicId, patientId },
    include: {
      patient: { select: { id: true, fullName: true } },
      visits: {
        orderBy: { visitNumber: "asc" },
        include: {
          appointments: {
            where: {
              status: {
                notIn: [
                  AppointmentStatus.COMPLETED,
                  AppointmentStatus.CANCELLED,
                  AppointmentStatus.NO_SHOW,
                ],
              },
            },
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              scheduledAt: true,
              status: true,
            },
          },
        },
      },
    },
  });
}

export async function createClinicTreatmentPlan(
  clinicId: string,
  patientId: string,
  input: CreateTreatmentPlanInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const patient = await transaction.patient.findFirst({
        where: { id: patientId, clinicId, archivedAt: null },
        select: { id: true },
      });

      if (!patient) {
        throw new TreatmentPatientNotFoundError();
      }

      return transaction.treatmentPlan.create({
        data: {
          clinicId,
          patientId,
          name: input.name,
          type: input.type,
          notes: input.notes,
          totalVisits: input.totalVisits,
          visits: {
            create: input.dueDates.map((dueDate, index) => ({
              clinic: { connect: { id: clinicId } },
              visitNumber: index + 1,
              dueDate: toDatabaseDate(dueDate),
            })),
          },
        },
        select: { id: true },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10_000,
    },
  );
}

export async function updateClinicTreatmentPlan(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  input: UpdateTreatmentPlanInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const plan = await transaction.treatmentPlan.findFirst({
        where: { id: treatmentPlanId, clinicId, patientId },
        include: { visits: { orderBy: { visitNumber: "asc" } } },
      });

      if (!plan) {
        throw new TreatmentPlanNotFoundError();
      }

      if (plan.status !== TreatmentPlanStatus.ACTIVE) {
        throw new TreatmentPlanStateError(
          "Only active treatment plans can be edited.",
        );
      }

      const visitNumbers = plan.visits.map(({ visitNumber }) => visitNumber);
      if (
        visitNumbers.some((visitNumber, index) => visitNumber !== index + 1)
      ) {
        throw new TreatmentPlanStateError(
          "This plan has an invalid visit sequence and cannot be edited.",
        );
      }

      if (
        !validateAdditionalVisits(
          input.totalVisits,
          plan.visits.length,
          input.additionalDueDates,
        )
      ) {
        throw new TreatmentPlanStateError(
          "The total must include all existing visits and a due date for each new visit.",
        );
      }

      await transaction.treatmentPlan.update({
        where: { id: plan.id },
        data: {
          name: input.name,
          type: input.type,
          notes: input.notes,
          totalVisits: input.totalVisits,
        },
      });

      if (input.additionalDueDates.length > 0) {
        await transaction.treatmentVisit.createMany({
          data: input.additionalDueDates.map((dueDate, index) => ({
            clinicId,
            patientId,
            treatmentPlanId: plan.id,
            visitNumber: plan.visits.length + index + 1,
            dueDate: toDatabaseDate(dueDate),
          })),
        });
      }

      return { id: plan.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rescheduleClinicTreatmentVisit(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  visitId: string,
  dueDate: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const visit = await transaction.treatmentVisit.findFirst({
        where: {
          id: visitId,
          clinicId,
          patientId,
          treatmentPlanId,
        },
        select: { id: true, status: true },
      });

      if (!visit) {
        throw new TreatmentVisitNotFoundError();
      }

      if (
        !canTransitionTreatmentVisit(
          visit.status,
          TreatmentVisitStatus.RESCHEDULED,
        )
      ) {
        throw new TreatmentVisitTransitionError();
      }

      await transaction.treatmentVisit.update({
        where: { id: visit.id },
        data: {
          dueDate: toDatabaseDate(dueDate),
          status: TreatmentVisitStatus.RESCHEDULED,
        },
      });

      await syncTreatmentPlanStatus(transaction, clinicId, treatmentPlanId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClinicTreatmentVisitStatus(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
  visitId: string,
  nextStatus: TreatmentVisitStatus,
) {
  const diagnostic = startTransactionDiagnostic("treatmentVisitStatus.update");
  try {
    await prisma.$transaction(
      async (transaction) => {
        recordTransactionPhase(diagnostic, "callback_entry");
        try {
          const visit = await measureTransactionQuery(
            diagnostic,
            "findVisit",
            () =>
              transaction.treatmentVisit.findFirst({
                where: {
                  id: visitId,
                  clinicId,
                  patientId,
                  treatmentPlanId,
                },
                select: { id: true, status: true },
              }),
          );

          if (!visit) {
            throw new TreatmentVisitNotFoundError();
          }

          if (!canTransitionTreatmentVisit(visit.status, nextStatus)) {
            throw new TreatmentVisitTransitionError();
          }

          await measureTransactionQuery(diagnostic, "updateVisit", () =>
            transaction.treatmentVisit.update({
              where: { id: visit.id },
              data: {
                status: nextStatus,
                completedAt:
                  nextStatus === TreatmentVisitStatus.COMPLETED
                    ? new Date()
                    : null,
              },
            }),
          );

          await syncTreatmentPlanStatus(
            transaction,
            clinicId,
            treatmentPlanId,
            diagnostic,
          );
          recordTransactionPhase(diagnostic, "callback_completed");
        } catch (error) {
          recordTransactionPhase(diagnostic, "callback_failed", error);
          throw error;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 10_000,
      },
    );
    recordTransactionPhase(diagnostic, "outer_resolved");
  } catch (error) {
    recordTransactionPhase(diagnostic, "outer_rejected", error);
    throw error;
  }
}

export async function cancelClinicTreatmentPlan(
  clinicId: string,
  patientId: string,
  treatmentPlanId: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const plan = await transaction.treatmentPlan.findFirst({
        where: { id: treatmentPlanId, clinicId, patientId },
        select: { id: true },
      });

      if (!plan) {
        throw new TreatmentPlanNotFoundError();
      }

      await transaction.treatmentVisit.updateMany({
        where: {
          clinicId,
          patientId,
          treatmentPlanId,
          status: { not: TreatmentVisitStatus.COMPLETED },
        },
        data: {
          status: TreatmentVisitStatus.CANCELLED,
          completedAt: null,
        },
      });

      await syncTreatmentPlanStatus(transaction, clinicId, treatmentPlanId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function syncTreatmentPlanStatus(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  treatmentPlanId: string,
  diagnostic?: TransactionDiagnostic,
): Promise<void> {
  const query = () =>
    transaction.treatmentPlan.findFirst({
      where: { id: treatmentPlanId, clinicId },
      select: {
        completedAt: true,
        visits: {
          where: { clinicId },
          select: { status: true },
        },
      },
    });
  const plan = diagnostic
    ? await measureTransactionQuery(
        diagnostic,
        "syncPlan.findPlanAndVisits",
        query,
      )
    : await query();
  if (!plan) throw new TreatmentPlanNotFoundError();
  const { visits } = plan;
  const allCompleted =
    visits.length > 0 &&
    visits.every(({ status }) => status === TreatmentVisitStatus.COMPLETED);
  const allClosed =
    visits.length > 0 &&
    visits.every(
      ({ status }) =>
        status === TreatmentVisitStatus.COMPLETED ||
        status === TreatmentVisitStatus.CANCELLED,
    );

  const updatePlan = () =>
    transaction.treatmentPlan.updateMany({
      where: { id: treatmentPlanId, clinicId },
      data: {
        status: allCompleted
          ? TreatmentPlanStatus.COMPLETED
          : allClosed
            ? TreatmentPlanStatus.CANCELLED
            : TreatmentPlanStatus.ACTIVE,
        completedAt: allCompleted ? (plan.completedAt ?? new Date()) : null,
      },
    });
  if (diagnostic) {
    await measureTransactionQuery(
      diagnostic,
      "syncPlan.updatePlan",
      updatePlan,
    );
  } else {
    await updatePlan();
  }
}
