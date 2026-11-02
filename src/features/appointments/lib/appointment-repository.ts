import "server-only";

import {
  AppointmentStatus,
  Prisma,
  TreatmentPlanStatus,
  TreatmentVisitStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertMonthlyAppointmentCapacity } from "@/features/billing/lib/billing-entitlements";
import {
  measureTransactionQuery,
  recordTransactionPhase,
  startTransactionDiagnostic,
  type TransactionDiagnostic,
} from "@/lib/db/transaction-diagnostics";
import {
  appointmentStartAt,
  appointmentsConflict,
  canTransitionAppointment,
  type AppointmentInput,
} from "@/features/appointments/lib/appointment-validation";

export class AppointmentPatientNotFoundError extends Error {}
export class AppointmentVisitNotFoundError extends Error {}
export class AppointmentVisitAlreadyScheduledError extends Error {
  constructor() {
    super("This treatment visit already has an active appointment.");
    this.name = "AppointmentVisitAlreadyScheduledError";
  }
}
export class AppointmentNotFoundError extends Error {}
export class AppointmentConflictError extends Error {}
export class AppointmentTransitionError extends Error {}

const INACTIVE_STATUSES = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
] as const;
const ACTIVE_BOOKING_STATUSES = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
] as const;

function runDiagnosticQuery<T>(
  diagnostic: TransactionDiagnostic | undefined,
  queryLabel: string,
  query: () => Promise<T>,
): Promise<T> {
  return diagnostic
    ? measureTransactionQuery(diagnostic, queryLabel, query)
    : query();
}

function clinicDateStart(date: string): Date {
  return appointmentStartAt(date, "00:00");
}

function clinicDateEnd(date: string): Date {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return appointmentStartAt(next.toISOString().slice(0, 10), "00:00");
}

async function assertNoSchedulingConflict(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  input: AppointmentInput,
  excludeId?: string,
  diagnostic?: TransactionDiagnostic,
): Promise<Date> {
  const startAt = appointmentStartAt(input.date, input.time);
  const rangeStart = new Date(startAt.getTime() - 8 * 60 * 60_000);
  const rangeEnd = new Date(startAt.getTime() + input.durationMinutes * 60_000);
  const appointments = await runDiagnosticQuery(
    diagnostic,
    "findSchedulingConflicts",
    () =>
      transaction.appointment.findMany({
        where: {
          clinicId,
          status: { notIn: [...INACTIVE_STATUSES] },
          scheduledAt: { gte: rangeStart, lt: rangeEnd },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          dentistName: true,
          chairLabel: true,
          status: true,
        },
      }),
  );
  if (
    appointmentsConflict(
      {
        id: excludeId,
        startAt,
        durationMinutes: input.durationMinutes,
        dentistName: input.dentistName,
        chairLabel: input.chairLabel,
      },
      appointments,
    )
  ) {
    throw new AppointmentConflictError(
      "The dentist or chair already has an overlapping appointment.",
    );
  }
  return startAt;
}

async function validatePatientAndVisit(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  input: AppointmentInput,
  diagnostic?: TransactionDiagnostic,
): Promise<void> {
  const treatmentVisitId = input.treatmentVisitId;
  if (!treatmentVisitId) {
    const patient = await runDiagnosticQuery(
      diagnostic,
      "validatePatient",
      () =>
        transaction.patient.findFirst({
          where: { id: input.patientId, clinicId },
          select: { id: true },
        }),
    );
    if (!patient) throw new AppointmentPatientNotFoundError();
    return;
  }

  const patientQuery = transaction.patient.findFirst({
    where: { id: input.patientId, clinicId },
    select: {
      id: true,
      treatmentPlans: {
        where: {
          clinicId,
          status: { not: TreatmentPlanStatus.CANCELLED },
          visits: {
            some: {
              id: treatmentVisitId,
              clinicId,
              status: {
                notIn: [
                  TreatmentVisitStatus.COMPLETED,
                  TreatmentVisitStatus.CANCELLED,
                ],
              },
            },
          },
        },
        select: {
          visits: {
            where: {
              id: treatmentVisitId,
              clinicId,
              status: {
                notIn: [
                  TreatmentVisitStatus.COMPLETED,
                  TreatmentVisitStatus.CANCELLED,
                ],
              },
            },
            select: { id: true },
          },
        },
      },
    },
  });
  const patient = diagnostic
    ? await measureTransactionQuery(
        diagnostic,
        "validatePatientAndVisit",
        () => patientQuery,
      )
    : await patientQuery;
  if (!patient) throw new AppointmentPatientNotFoundError();
  if (!patient.treatmentPlans.some((plan) => plan.visits.length > 0)) {
    throw new AppointmentVisitNotFoundError();
  }
}

async function validateVisitBookingAvailability(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  treatmentVisitId: string | null,
  excludeAppointmentId?: string,
): Promise<void> {
  if (!treatmentVisitId) return;

  const activeAppointment = await transaction.appointment.findFirst({
    where: {
      clinicId,
      treatmentVisitId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });

  if (activeAppointment) {
    throw new AppointmentVisitAlreadyScheduledError();
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isTransactionLifecycleFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  );
}

async function rethrowVisitBookingConflict(
  error: unknown,
  clinicId: string,
  treatmentVisitId: string | null,
  excludeAppointmentId?: string,
): Promise<void> {
  if (
    !treatmentVisitId ||
    (!isUniqueConstraintViolation(error) &&
      !isSerializationFailure(error) &&
      !isTransactionLifecycleFailure(error))
  ) {
    return;
  }

  const conflictingAppointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      treatmentVisitId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });

  if (conflictingAppointment) {
    throw new AppointmentVisitAlreadyScheduledError();
  }
}

export async function listClinicAppointments(clinicId: string, date: string) {
  return prisma.appointment.findMany({
    where: {
      clinicId,
      scheduledAt: { gte: clinicDateStart(date), lt: clinicDateEnd(date) },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      patient: { select: { id: true, fullName: true, phoneNumber: true } },
      treatmentVisit: {
        select: {
          id: true,
          visitNumber: true,
          status: true,
          treatmentPlan: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function listAppointmentPatients(clinicId: string) {
  return prisma.patient.findMany({
    where: { clinicId },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}

export async function listAppointmentVisits(clinicId: string) {
  return prisma.treatmentVisit.findMany({
    where: {
      clinicId,
      status: {
        notIn: [TreatmentVisitStatus.COMPLETED, TreatmentVisitStatus.CANCELLED],
      },
      treatmentPlan: { status: { not: "CANCELLED" } },
    },
    orderBy: [{ dueDate: "asc" }, { visitNumber: "asc" }],
    select: {
      id: true,
      patientId: true,
      visitNumber: true,
      dueDate: true,
      treatmentPlan: { select: { name: true } },
    },
  });
}

async function createClinicAppointmentTransaction(
  clinicId: string,
  input: AppointmentInput,
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertMonthlyAppointmentCapacity(transaction, clinicId);
      await validatePatientAndVisit(transaction, clinicId, input);
      await validateVisitBookingAvailability(
        transaction,
        clinicId,
        input.treatmentVisitId,
      );
      const scheduledAt = await assertNoSchedulingConflict(
        transaction,
        clinicId,
        input,
      );
      return transaction.appointment.create({
        data: {
          clinicId,
          patientId: input.patientId,
          treatmentVisitId: input.treatmentVisitId,
          scheduledAt,
          durationMinutes: input.durationMinutes,
          dentistName: input.dentistName,
          chairLabel: input.chairLabel,
          type: input.type,
          notes: input.notes,
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

export async function createClinicAppointment(
  clinicId: string,
  input: AppointmentInput,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await createClinicAppointmentTransaction(clinicId, input);
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) continue;
      await rethrowVisitBookingConflict(
        error,
        clinicId,
        input.treatmentVisitId,
      );
      throw error;
    }
  }

  throw new Error("Appointment creation retry limit exceeded.");
}

export async function updateClinicAppointment(
  clinicId: string,
  appointmentId: string,
  input: AppointmentInput,
) {
  const diagnostic = startTransactionDiagnostic("appointment.update");
  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        recordTransactionPhase(diagnostic, "callback_entry");
        try {
          const existing = await measureTransactionQuery(
            diagnostic,
            "findAppointment",
            () =>
              transaction.appointment.findFirst({
                where: { id: appointmentId, clinicId },
                select: { id: true, status: true },
              }),
          );
          if (!existing) throw new AppointmentNotFoundError();
          if (
            existing.status === AppointmentStatus.COMPLETED ||
            existing.status === AppointmentStatus.CANCELLED
          ) {
            throw new AppointmentTransitionError(
              "Completed or cancelled appointments cannot be edited.",
            );
          }
          await validatePatientAndVisit(
            transaction,
            clinicId,
            input,
            diagnostic,
          );
          await validateVisitBookingAvailability(
            transaction,
            clinicId,
            input.treatmentVisitId,
            appointmentId,
          );
          const scheduledAt = await assertNoSchedulingConflict(
            transaction,
            clinicId,
            input,
            appointmentId,
            diagnostic,
          );
          await measureTransactionQuery(diagnostic, "updateAppointment", () =>
            transaction.appointment.updateMany({
              where: { id: appointmentId, clinicId },
              data: {
                patientId: input.patientId,
                treatmentVisitId: input.treatmentVisitId,
                scheduledAt,
                durationMinutes: input.durationMinutes,
                dentistName: input.dentistName,
                chairLabel: input.chairLabel,
                type: input.type,
                notes: input.notes,
              },
            }),
          );
          recordTransactionPhase(diagnostic, "callback_completed");
          return { id: appointmentId };
        } catch (error) {
          recordTransactionPhase(diagnostic, "callback_failed", error);
          throw error;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10_000,
      },
    );
    recordTransactionPhase(diagnostic, "outer_resolved");
    return result;
  } catch (error) {
    recordTransactionPhase(diagnostic, "outer_rejected", error);
    await rethrowVisitBookingConflict(
      error,
      clinicId,
      input.treatmentVisitId,
      appointmentId,
    );
    throw error;
  }
}

export async function updateClinicAppointmentStatus(
  clinicId: string,
  appointmentId: string,
  status: AppointmentStatus,
) {
  return prisma.$transaction(
    async (transaction) => {
      const appointment = await transaction.appointment.findFirst({
        where: { id: appointmentId, clinicId },
        select: { id: true, status: true },
      });
      if (!appointment) throw new AppointmentNotFoundError();
      if (!canTransitionAppointment(appointment.status, status)) {
        throw new AppointmentTransitionError(
          "This appointment cannot move to the selected status.",
        );
      }
      await transaction.appointment.updateMany({
        where: { id: appointmentId, clinicId },
        data: { status },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listClinicAppointmentsInRange(
  clinicId: string,
  startDate: string,
  endDate: string,
) {
  return prisma.appointment.findMany({
    where: {
      clinicId,
      scheduledAt: {
        gte: clinicDateStart(startDate),
        lt: clinicDateEnd(endDate),
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      patient: { select: { id: true, fullName: true, phoneNumber: true } },
      treatmentVisit: {
        select: {
          id: true,
          visitNumber: true,
          status: true,
          treatmentPlan: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function countClinicAppointments(clinicId: string, date: string) {
  return prisma.appointment.count({
    where: {
      clinicId,
      scheduledAt: { gte: clinicDateStart(date), lt: clinicDateEnd(date) },
      status: { notIn: [...INACTIVE_STATUSES] },
    },
  });
}

export async function countClinicAppointmentsByStatus(
  clinicId: string,
  statuses: readonly AppointmentStatus[],
  startDate?: string,
  endDate?: string,
) {
  return prisma.appointment.count({
    where: {
      clinicId,
      ...(startDate && endDate
        ? {
            scheduledAt: {
              gte: clinicDateStart(startDate),
              lt: clinicDateEnd(endDate),
            },
          }
        : {}),
      status: { in: [...statuses] },
    },
  });
}
