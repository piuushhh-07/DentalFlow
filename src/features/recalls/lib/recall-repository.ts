import "server-only";

import { Prisma, PreventiveRecallStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  getClinicToday,
  getRecallPagination,
  canRescheduleRecall,
  canTransitionRecallStatus,
  toDatabaseDate,
  type RecallFilter,
  type RecallInput,
} from "@/features/recalls/lib/recall-validation";

export class RecallPatientNotFoundError extends Error {
  constructor() {
    super("The selected patient is not available in this clinic.");
    this.name = "RecallPatientNotFoundError";
  }
}

export class RecallNotFoundError extends Error {
  constructor() {
    super("The recall is not available in this clinic.");
    this.name = "RecallNotFoundError";
  }
}

export class RecallStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecallStateError";
  }
}

function recallData(input: RecallInput) {
  return {
    type: input.type,
    customName: input.customName,
    intervalMonths: input.intervalMonths,
    dueDate: toDatabaseDate(input.dueDate),
    notes: input.notes,
  };
}

function buildRecallWhere(
  clinicId: string,
  query: string,
  filter: RecallFilter,
): Prisma.PreventiveRecallWhereInput {
  const today = toDatabaseDate(getClinicToday());
  const base: Prisma.PreventiveRecallWhereInput = {
    clinicId,
    ...(query
      ? {
          OR: [
            { patient: { fullName: { contains: query, mode: "insensitive" } } },
            { customName: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  switch (filter) {
    case "due":
      return {
        ...base,
        status: PreventiveRecallStatus.ACTIVE,
        dueDate: { gte: today },
      };
    case "overdue":
      return {
        ...base,
        status: PreventiveRecallStatus.ACTIVE,
        dueDate: { lt: today },
      };
    case "completed":
      return { ...base, status: PreventiveRecallStatus.COMPLETED };
    case "paused":
      return { ...base, status: PreventiveRecallStatus.PAUSED };
    case "cancelled":
      return { ...base, status: PreventiveRecallStatus.CANCELLED };
    default:
      return base;
  }
}

export async function listClinicRecalls(
  clinicId: string,
  query: string,
  filter: RecallFilter,
  requestedPage: number,
) {
  const where = buildRecallWhere(clinicId, query, filter);
  const totalCount = await prisma.preventiveRecall.count({ where });
  const pagination = getRecallPagination(totalCount, requestedPage);
  const recalls = await prisma.preventiveRecall.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.pageSize,
    include: {
      patient: {
        select: { id: true, fullName: true, phoneNumber: true },
      },
    },
  });

  return { recalls, pagination };
}

export async function listClinicRecallPatients(
  clinicId: string,
  query: string,
  requestedPage: number,
) {
  const where: Prisma.PatientWhereInput = {
    clinicId,
    ...(query
      ? { fullName: { contains: query, mode: "insensitive" as const } }
      : {}),
  };
  const totalCount = await prisma.patient.count({ where });
  const pagination = getRecallPagination(totalCount, requestedPage);
  const patients = await prisma.patient.findMany({
    where,
    orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.pageSize,
    select: { id: true, fullName: true, phoneNumber: true },
  });
  return { patients, pagination };
}

export async function getClinicRecall(clinicId: string, recallId: string) {
  return prisma.preventiveRecall.findFirst({
    where: { id: recallId, clinicId },
    include: {
      patient: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          whatsappOptIn: true,
          whatsappOptedInAt: true,
        },
      },
    },
  });
}

export async function createClinicRecall(
  clinicId: string,
  patientId: string,
  input: RecallInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const patient = await transaction.patient.findFirst({
        where: { id: patientId, clinicId },
        select: { id: true },
      });
      if (!patient) {
        throw new RecallPatientNotFoundError();
      }

      return transaction.preventiveRecall.create({
        data: { clinicId, patientId, ...recallData(input) },
        select: { id: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClinicRecall(
  clinicId: string,
  patientId: string,
  recallId: string,
  input: RecallInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      const recall = await transaction.preventiveRecall.findFirst({
        where: { id: recallId, clinicId, patientId },
        select: { id: true, status: true },
      });
      if (!recall) {
        throw new RecallNotFoundError();
      }
      if (recall.status === PreventiveRecallStatus.COMPLETED) {
        throw new RecallStateError("Completed recalls cannot be edited.");
      }

      const result = await transaction.preventiveRecall.updateMany({
        where: { id: recall.id, clinicId, patientId },
        data: recallData(input),
      });
      if (result.count === 0) throw new RecallNotFoundError();
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rescheduleClinicRecall(
  clinicId: string,
  recallId: string,
  dueDate: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const recall = await transaction.preventiveRecall.findFirst({
        where: { id: recallId, clinicId },
        select: { id: true, status: true },
      });
      if (!recall) {
        throw new RecallNotFoundError();
      }
      if (!canRescheduleRecall(recall.status)) {
        throw new RecallStateError("Only active recalls can be rescheduled.");
      }

      const result = await transaction.preventiveRecall.updateMany({
        where: { id: recall.id, clinicId },
        data: { dueDate: toDatabaseDate(dueDate) },
      });
      if (result.count === 0) throw new RecallNotFoundError();
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClinicRecallStatus(
  clinicId: string,
  recallId: string,
  nextStatus: PreventiveRecallStatus,
) {
  return prisma.$transaction(
    async (transaction) => {
      const recall = await transaction.preventiveRecall.findFirst({
        where: { id: recallId, clinicId },
        select: { id: true, status: true },
      });
      if (!recall) {
        throw new RecallNotFoundError();
      }
      if (!canTransitionRecallStatus(recall.status, nextStatus)) {
        throw new RecallStateError("Completed recalls cannot be reopened.");
      }

      const result = await transaction.preventiveRecall.updateMany({
        where: { id: recall.id, clinicId },
        data: {
          status: nextStatus,
          completedAt:
            nextStatus === PreventiveRecallStatus.COMPLETED ? new Date() : null,
        },
      });
      if (result.count === 0) throw new RecallNotFoundError();
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
