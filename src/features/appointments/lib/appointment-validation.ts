import { AppointmentStatus } from "@prisma/client";
import { z } from "zod";

const clinicDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid appointment date.");

const appointmentDetailsSchema = z.object({
  patientId: z.string().uuid(),
  treatmentVisitId: z
    .union([z.string().uuid(), z.literal("")])
    .transform((value) => value || null),
  date: clinicDateSchema,
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid appointment time."),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  dentistId: z.string().uuid(),
  chairId: z.string().uuid(),
  type: z.string().trim().min(2).max(160),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null),
});

export const createAppointmentSchema = appointmentDetailsSchema;
export const updateAppointmentSchema = appointmentDetailsSchema.and(
  z.object({ appointmentId: z.string().uuid() }),
);
export const appointmentStatusSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.nativeEnum(AppointmentStatus),
});

const clockTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const dentistAvailabilitySchema = z
  .array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      isWorking: z.boolean(),
      startTime: clockTimeSchema,
      endTime: clockTimeSchema,
    }),
  )
  .max(7)
  .refine(
    (days) =>
      new Set(days.map(({ dayOfWeek }) => dayOfWeek)).size === days.length,
    "Each weekday can only be configured once.",
  )
  .refine(
    (days) =>
      days.every(
        ({ startTime, endTime }) =>
          Number(startTime.replace(":", "")) < Number(endTime.replace(":", "")),
      ),
    "Working hours must end after they start.",
  );

export type AppointmentInput = z.output<typeof createAppointmentSchema>;

export function isWithinDentistWorkingHours(
  availability: unknown,
  date: string,
  time: string,
  durationMinutes: number,
): boolean {
  if (availability === null || availability === undefined) return true;
  const parsed = dentistAvailabilitySchema.safeParse(availability);
  if (!parsed.success) return false;
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const day = parsed.data.find((entry) => entry.dayOfWeek === dayOfWeek);
  if (!day?.isWorking) return false;
  const closingTime =
    Number(day.endTime.slice(0, 2)) * 60 + Number(day.endTime.slice(3, 5));
  const startMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const openingTime =
    Number(day.startTime.slice(0, 2)) * 60 + Number(day.startTime.slice(3, 5));
  return (
    startMinutes + durationMinutes <= closingTime && startMinutes >= openingTime
  );
}

export function appointmentStartAt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

const transitions: Readonly<
  Record<AppointmentStatus, readonly AppointmentStatus[]>
> = {
  SCHEDULED: [
    "CONFIRMED",
    "CHECKED_IN",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ],
  CONFIRMED: ["CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ["SCHEDULED", "CONFIRMED", "CANCELLED"],
};

export function canTransitionAppointment(
  current: AppointmentStatus,
  next: AppointmentStatus,
): boolean {
  return current === next || transitions[current].includes(next);
}

export function isActiveAppointmentStatus(status: AppointmentStatus): boolean {
  return (
    status !== AppointmentStatus.COMPLETED &&
    status !== AppointmentStatus.CANCELLED &&
    status !== AppointmentStatus.NO_SHOW
  );
}

export function appointmentsConflict(
  requested: Readonly<{
    id?: string;
    startAt: Date;
    durationMinutes: number;
    dentistName: string;
    chairLabel: string;
    dentistId?: string | null;
    chairId?: string | null;
  }>,
  existing: readonly Readonly<{
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    dentistName: string;
    chairLabel: string;
    dentistId?: string | null;
    chairId?: string | null;
    status: AppointmentStatus;
  }>[],
): boolean {
  const requestedEnd =
    requested.startAt.getTime() + requested.durationMinutes * 60_000;
  return existing.some((appointment) => {
    if (
      appointment.id === requested.id ||
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      return false;
    }
    const existingStart = appointment.scheduledAt.getTime();
    const existingEnd = existingStart + appointment.durationMinutes * 60_000;
    const overlaps =
      requested.startAt.getTime() < existingEnd && existingStart < requestedEnd;
    return (
      overlaps &&
      ((requested.dentistId && appointment.dentistId
        ? appointment.dentistId === requested.dentistId
        : appointment.dentistName.toLocaleLowerCase() ===
          requested.dentistName.toLocaleLowerCase()) ||
        (requested.chairId && appointment.chairId
          ? appointment.chairId === requested.chairId
          : appointment.chairLabel.toLocaleLowerCase() ===
            requested.chairLabel.toLocaleLowerCase()))
    );
  });
}
