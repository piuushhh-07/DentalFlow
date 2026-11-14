import "server-only";

import {
  AppointmentRequestStatus,
  AppointmentStatus,
  Prisma,
  TreatmentPlanStatus,
  TreatmentVisitStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  assertMonthlyAppointmentCapacity,
  assertPatientCapacity,
} from "@/features/billing/lib/billing-entitlements";
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
import {
  getPublicAppointmentRateLimitConfig,
  isPublicAppointmentRequestRateLimited,
} from "@/features/appointments/lib/appointment-rate-limit";
import {
  createOrReusePublicBookingRequest,
  getPublicBookingPhoneLockKey,
  getPublicBookingPhoneLockQuery,
  PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS,
  PUBLIC_BOOKING_LOCK_TIMEOUT,
  PUBLIC_BOOKING_TRANSACTION_TIMEOUT_MS,
} from "@/features/appointments/lib/public-booking-idempotency";
import { getClinicDateRangeBounds } from "@/features/appointments/lib/appointment-calendar";

export class AppointmentPatientNotFoundError extends Error {}
export class AppointmentVisitNotFoundError extends Error {}
export class AppointmentResourceNotFoundError extends Error {}
export class ScheduleResourceDuplicateError extends Error {
  constructor() {
    super("A schedule resource with this name already exists in this clinic.");
    this.name = "ScheduleResourceDuplicateError";
  }
}
export class ScheduleResourceNotFoundError extends Error {}
export class AppointmentRequestNotFoundError extends Error {}
export class AppointmentRequestConflictError extends Error {}
export class AppointmentRequestRateLimitError extends Error {}
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
  resources: Readonly<{ dentistName: string; chairLabel: string }>,
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
          dentistId: true,
          chairId: true,
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
        dentistId: input.dentistId,
        chairId: input.chairId,
        dentistName: resources.dentistName,
        chairLabel: resources.chairLabel,
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

async function getActiveScheduleResources(
  transaction: Prisma.TransactionClient,
  clinicId: string,
  input: Pick<AppointmentInput, "dentistId" | "chairId">,
): Promise<Readonly<{ dentistName: string; chairLabel: string }>> {
  const [dentist, chair] = await Promise.all([
    transaction.clinicDentist.findFirst({
      where: { id: input.dentistId, clinicId, active: true },
      select: { id: true, name: true },
    }),
    transaction.treatmentChair.findFirst({
      where: { id: input.chairId, clinicId, active: true },
      select: { id: true, label: true },
    }),
  ]);
  if (!dentist || !chair) throw new AppointmentResourceNotFoundError();
  return { dentistName: dentist.name, chairLabel: chair.label };
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
          where: { id: input.patientId, clinicId, archivedAt: null },
          select: { id: true },
        }),
    );
    if (!patient) throw new AppointmentPatientNotFoundError();
    return;
  }

  const patientQuery = transaction.patient.findFirst({
    where: { id: input.patientId, clinicId, archivedAt: null },
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

export async function getAppointmentPrefill(
  clinicId: string,
  patientId: string,
  visitId: string,
) {
  const [patient, visit] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, clinicId, archivedAt: null },
      select: { id: true, fullName: true },
    }),
    prisma.treatmentVisit.findFirst({
      where: {
        id: visitId,
        clinicId,
        patientId,
        status: {
          notIn: [
            TreatmentVisitStatus.COMPLETED,
            TreatmentVisitStatus.CANCELLED,
          ],
        },
        treatmentPlan: { status: { not: TreatmentPlanStatus.CANCELLED } },
      },
      select: {
        id: true,
        patientId: true,
        visitNumber: true,
        dueDate: true,
        treatmentPlan: { select: { name: true } },
      },
    }),
  ]);
  return patient && visit ? { patient, visit } : null;
}

export async function listAppointmentPatients(clinicId: string) {
  return prisma.patient.findMany({
    where: { clinicId, archivedAt: null },
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

export async function listAppointmentResources(clinicId: string) {
  const [dentists, chairs] = await Promise.all([
    prisma.clinicDentist.findMany({
      where: { clinicId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.treatmentChair.findMany({
      where: { clinicId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, active: true },
    }),
  ]);
  return { dentists, chairs };
}

export async function listScheduleResources(clinicId: string) {
  const [dentists, chairs] = await Promise.all([
    prisma.clinicDentist.findMany({
      where: { clinicId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    prisma.treatmentChair.findMany({
      where: { clinicId },
      orderBy: [{ active: "desc" }, { label: "asc" }],
      select: { id: true, label: true, active: true },
    }),
  ]);
  return { dentists, chairs };
}

export async function getPublicBookingClinic(slug: string) {
  return prisma.clinic.findFirst({
    where: { publicBookingSlug: slug, publicBookingEnabled: true },
    select: {
      id: true,
      name: true,
      publicBookingSlug: true,
      phoneNumber: true,
      address: true,
      timeZone: true,
      workingHours: true,
      dentists: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      treatmentChairs: {
        where: { active: true },
        orderBy: { label: "asc" },
        select: { id: true, label: true },
      },
    },
  });
}

export async function getPublicBookingSettings(clinicId: string) {
  return prisma.clinic.findFirst({
    where: { id: clinicId },
    select: { publicBookingSlug: true, publicBookingEnabled: true },
  });
}

export async function setPublicBookingEnabled(
  clinicId: string,
  enabled: boolean,
) {
  const result = await prisma.clinic.updateMany({
    where: { id: clinicId },
    data: { publicBookingEnabled: enabled },
  });
  if (result.count !== 1) {
    throw new Error(
      "The clinic could not be found while updating booking settings.",
    );
  }
}

export async function listAppointmentRequests(clinicId: string) {
  return prisma.appointmentRequest.findMany({
    where: { clinicId, status: AppointmentRequestStatus.PENDING },
    orderBy: [{ requestedAt: "asc" }, { createdAt: "asc" }],
    include: {
      dentist: { select: { name: true } },
      chair: { select: { label: true } },
    },
  });
}

export async function createPublicAppointmentRequest(
  clinicId: string,
  input: Readonly<{
    patientName: string;
    phoneNumber: string;
    requestedAt: Date;
    dentistId: string;
    chairId: string;
    notes: string | null;
  }>,
) {
  const rateLimit = getPublicAppointmentRateLimitConfig(
    process.env.PUBLIC_APPOINTMENT_RATE_LIMIT_MAX_REQUESTS,
    process.env.PUBLIC_APPOINTMENT_RATE_LIMIT_WINDOW_MINUTES,
  );
  const startAt = input.requestedAt;
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  const overlapStart = new Date(startAt.getTime() - 8 * 60 * 60_000);
  const [dentist, chair] = await Promise.all([
    prisma.clinicDentist.findFirst({
      where: { id: input.dentistId, clinicId, active: true },
      select: { id: true },
    }),
    prisma.treatmentChair.findFirst({
      where: { id: input.chairId, clinicId, active: true },
      select: { id: true },
    }),
  ]);
  if (!dentist || !chair) throw new AppointmentResourceNotFoundError();

  const now = new Date();
  const idempotencyCutoff = new Date(
    now.getTime() - PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS,
  );
  const phoneLockKey = getPublicBookingPhoneLockKey(
    clinicId,
    input.phoneNumber,
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          return createOrReusePublicBookingRequest(clinicId, input, now, {
            withLock: async (operation) => {
              await transaction.$queryRaw<{ lock_timeout: string }[]>`
                SELECT set_config(
                  'lock_timeout',
                  ${PUBLIC_BOOKING_LOCK_TIMEOUT},
                  true
                ) AS lock_timeout
              `;
              await transaction.$queryRaw<{ locked: number }[]>(
                getPublicBookingPhoneLockQuery(phoneLockKey),
              );
              return operation();
            },
            findRecentRequests: () =>
              transaction.appointmentRequest.findMany({
                where: {
                  clinicId,
                  phoneNumber: input.phoneNumber,
                  requestedAt: startAt,
                  status: AppointmentRequestStatus.PENDING,
                  createdAt: { gte: idempotencyCutoff, lte: now },
                },
                select: {
                  id: true,
                  clinicId: true,
                  patientName: true,
                  phoneNumber: true,
                  requestedAt: true,
                  dentistId: true,
                  chairId: true,
                  notes: true,
                  createdAt: true,
                },
              }),
            createRequest: async () => {
              const recentRequestCount =
                await transaction.appointmentRequest.count({
                  where: {
                    clinicId,
                    phoneNumber: input.phoneNumber,
                    createdAt: {
                      gte: new Date(
                        Date.now() - rateLimit.windowMinutes * 60_000,
                      ),
                    },
                  },
                });
              if (
                isPublicAppointmentRequestRateLimited(
                  recentRequestCount,
                  rateLimit.maxRequests,
                )
              ) {
                throw new AppointmentRequestRateLimitError();
              }

              const appointments = await transaction.appointment.findMany({
                where: {
                  clinicId,
                  status: { notIn: [...INACTIVE_STATUSES] },
                  scheduledAt: { gte: overlapStart, lt: endAt },
                  OR: [{ dentistId: dentist.id }, { chairId: chair.id }],
                },
                select: {
                  id: true,
                  scheduledAt: true,
                  durationMinutes: true,
                  dentistId: true,
                  chairId: true,
                  dentistName: true,
                  chairLabel: true,
                  status: true,
                },
              });
              const requests = await transaction.appointmentRequest.findMany({
                where: {
                  clinicId,
                  status: AppointmentRequestStatus.PENDING,
                  requestedAt: { gte: overlapStart, lt: endAt },
                  OR: [{ dentistId: dentist.id }, { chairId: chair.id }],
                },
                select: {
                  requestedAt: true,
                  durationMinutes: true,
                  dentistId: true,
                  chairId: true,
                },
              });
              const overlaps = (otherStart: Date, otherDuration: number) =>
                startAt.getTime() <
                  otherStart.getTime() + otherDuration * 60_000 &&
                otherStart.getTime() < endAt.getTime();
              if (
                appointments.some((appointment) =>
                  overlaps(
                    appointment.scheduledAt,
                    appointment.durationMinutes,
                  ),
                ) ||
                requests.some(
                  (request) =>
                    (request.dentistId === dentist.id ||
                      request.chairId === chair.id) &&
                    overlaps(request.requestedAt, request.durationMinutes),
                )
              ) {
                throw new AppointmentRequestConflictError();
              }

              return transaction.appointmentRequest.create({
                data: {
                  clinicId,
                  patientName: input.patientName,
                  phoneNumber: input.phoneNumber,
                  requestedAt: startAt,
                  durationMinutes: 30,
                  type: "Consultation",
                  dentistId: dentist.id,
                  chairId: chair.id,
                  notes: input.notes,
                },
                select: { id: true },
              });
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: PUBLIC_BOOKING_TRANSACTION_TIMEOUT_MS,
        },
      );
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) continue;
      throw error;
    }
  }

  throw new Error("Public appointment request retry limit exceeded.");
}

export async function rejectAppointmentRequest(
  clinicId: string,
  requestId: string,
) {
  const result = await prisma.appointmentRequest.updateMany({
    where: {
      id: requestId,
      clinicId,
      status: AppointmentRequestStatus.PENDING,
    },
    data: { status: AppointmentRequestStatus.REJECTED },
  });
  if (result.count === 0) throw new AppointmentRequestNotFoundError();
}

export async function approveAppointmentRequest(
  clinicId: string,
  requestId: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const request = await transaction.appointmentRequest.findFirst({
            where: {
              id: requestId,
              clinicId,
              status: AppointmentRequestStatus.PENDING,
            },
          });
          if (!request) throw new AppointmentRequestNotFoundError();
          if (!request.dentistId || !request.chairId) {
            throw new AppointmentResourceNotFoundError();
          }

          const startAt = request.requestedAt;
          const resources = await getActiveScheduleResources(
            transaction,
            clinicId,
            { dentistId: request.dentistId, chairId: request.chairId },
          );
          const appointmentInput = {
            date: new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Kolkata",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(startAt),
            time: new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(startAt),
            durationMinutes: request.durationMinutes,
            dentistId: request.dentistId,
            chairId: request.chairId,
          };
          const patient = await transaction.patient.findFirst({
            where: { clinicId, normalizedPhone: request.phoneNumber },
            select: { id: true },
          });
          let patientId = patient?.id;
          if (!patientId) {
            await assertPatientCapacity(transaction, clinicId);
            const createdPatient = await transaction.patient.create({
              data: {
                clinicId,
                fullName: request.patientName,
                phoneNumber: request.phoneNumber,
                normalizedPhone: request.phoneNumber,
              },
              select: { id: true },
            });
            patientId = createdPatient.id;
          }

          await assertMonthlyAppointmentCapacity(transaction, clinicId);
          const conflictInput = {
            date: appointmentInput.date,
            time: appointmentInput.time,
            durationMinutes: appointmentInput.durationMinutes,
            dentistName: resources.dentistName,
            chairLabel: resources.chairLabel,
          };
          const scheduledAt = await assertNoSchedulingConflict(
            transaction,
            clinicId,
            {
              ...conflictInput,
              patientId,
              treatmentVisitId: null,
              dentistId: request.dentistId,
              chairId: request.chairId,
              type: request.type,
              notes: request.notes,
            },
            resources,
          );
          const appointment = await transaction.appointment.create({
            data: {
              clinicId,
              patientId,
              scheduledAt,
              durationMinutes: request.durationMinutes,
              dentistId: request.dentistId,
              chairId: request.chairId,
              dentistName: resources.dentistName,
              chairLabel: resources.chairLabel,
              type: request.type,
              notes: request.notes,
            },
            select: { id: true },
          });
          const updatedRequest =
            await transaction.appointmentRequest.updateMany({
              where: {
                id: request.id,
                clinicId,
                status: AppointmentRequestStatus.PENDING,
              },
              data: { status: AppointmentRequestStatus.APPROVED },
            });
          if (updatedRequest.count !== 1) {
            throw new AppointmentRequestNotFoundError();
          }
          return appointment;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10_000,
        },
      );
    } catch (error) {
      if (attempt === 0 && isSerializationFailure(error)) continue;
      throw error;
    }
  }

  throw new Error("Appointment request approval retry limit exceeded.");
}

export async function createScheduleResource(
  clinicId: string,
  kind: "dentist" | "chair",
  name: string,
) {
  if (kind === "dentist") {
    const duplicate = await prisma.clinicDentist.findFirst({
      where: { clinicId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new ScheduleResourceDuplicateError();
    return prisma.clinicDentist.create({
      data: { clinicId, name },
      select: { id: true },
    });
  }
  const duplicate = await prisma.treatmentChair.findFirst({
    where: { clinicId, label: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new ScheduleResourceDuplicateError();
  return prisma.treatmentChair.create({
    data: { clinicId, label: name },
    select: { id: true },
  });
}

export async function renameScheduleResource(
  clinicId: string,
  kind: "dentist" | "chair",
  resourceId: string,
  name: string,
) {
  if (kind === "dentist") {
    const duplicate = await prisma.clinicDentist.findFirst({
      where: {
        clinicId,
        id: { not: resourceId },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) throw new ScheduleResourceDuplicateError();
    const result = await prisma.clinicDentist.updateMany({
      where: { id: resourceId, clinicId },
      data: { name },
    });
    if (result.count !== 1) throw new ScheduleResourceNotFoundError();
    return;
  }

  const duplicate = await prisma.treatmentChair.findFirst({
    where: {
      clinicId,
      id: { not: resourceId },
      label: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) throw new ScheduleResourceDuplicateError();
  const result = await prisma.treatmentChair.updateMany({
    where: { id: resourceId, clinicId },
    data: { label: name },
  });
  if (result.count !== 1) throw new ScheduleResourceNotFoundError();
}

export async function setScheduleResourceActive(
  clinicId: string,
  kind: "dentist" | "chair",
  resourceId: string,
  active: boolean,
) {
  if (kind === "dentist") {
    const result = await prisma.clinicDentist.updateMany({
      where: { id: resourceId, clinicId },
      data: { active },
    });
    if (result.count !== 1) throw new ScheduleResourceNotFoundError();
    return;
  }

  const result = await prisma.treatmentChair.updateMany({
    where: { id: resourceId, clinicId },
    data: { active },
  });
  if (result.count !== 1) throw new ScheduleResourceNotFoundError();
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
      const resources = await getActiveScheduleResources(
        transaction,
        clinicId,
        input,
      );
      const scheduledAt = await assertNoSchedulingConflict(
        transaction,
        clinicId,
        input,
        resources,
      );
      return transaction.appointment.create({
        data: {
          clinicId,
          patientId: input.patientId,
          treatmentVisitId: input.treatmentVisitId,
          dentistId: input.dentistId,
          chairId: input.chairId,
          scheduledAt,
          durationMinutes: input.durationMinutes,
          dentistName: resources.dentistName,
          chairLabel: resources.chairLabel,
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
            const resources = await getActiveScheduleResources(
              transaction,
              clinicId,
              input,
            );
            const scheduledAt = await assertNoSchedulingConflict(
              transaction,
              clinicId,
              input,
              resources,
              appointmentId,
              diagnostic,
            );
            await measureTransactionQuery(diagnostic, "updateAppointment", () =>
              transaction.appointment.updateMany({
                where: { id: appointmentId, clinicId },
                data: {
                  patientId: input.patientId,
                  treatmentVisitId: input.treatmentVisitId,
                  dentistId: input.dentistId,
                  chairId: input.chairId,
                  scheduledAt,
                  durationMinutes: input.durationMinutes,
                  dentistName: resources.dentistName,
                  chairLabel: resources.chairLabel,
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
      if (attempt === 0 && isSerializationFailure(error)) {
        recordTransactionPhase(diagnostic, "serialization_retry", error);
        continue;
      }
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

  throw new Error("Appointment update retry limit exceeded.");
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
  const { startAt, endAt } = getClinicDateRangeBounds(startDate, endDate);
  return prisma.appointment.findMany({
    where: {
      clinicId,
      scheduledAt: {
        gte: startAt,
        lt: endAt,
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

export async function listPatientAppointments(
  clinicId: string,
  patientId: string,
) {
  const now = new Date();
  const patientScope = { clinicId, patientId };
  const upcomingWhere = {
    ...patientScope,
    scheduledAt: { gte: now },
    status: { not: AppointmentStatus.CANCELLED },
  };
  const [upcomingCount, upcoming, past] = await Promise.all([
    prisma.appointment.count({ where: upcomingWhere }),
    prisma.appointment.findMany({
      where: upcomingWhere,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: 8,
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        dentistName: true,
        chairLabel: true,
        type: true,
        status: true,
      },
    }),
    prisma.appointment.findMany({
      where: { ...patientScope, scheduledAt: { lt: now } },
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        dentistName: true,
        chairLabel: true,
        type: true,
        status: true,
      },
    }),
  ]);
  return { upcomingCount, upcoming, past };
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
