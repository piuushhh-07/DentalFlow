import {
  TreatmentPlanStatus,
  TreatmentType,
  TreatmentVisitStatus,
} from "@prisma/client";
import { z } from "zod";

export const MAX_TREATMENT_VISITS = 30;

export const treatmentTypeLabels: Record<TreatmentType, string> = {
  ROOT_CANAL: "Root canal",
  CROWN: "Crown",
  IMPLANT: "Implant",
  BRACES: "Braces",
  SCALING: "Scaling",
  CUSTOM: "Custom treatment",
};

export const treatmentPlanStatusLabels: Record<TreatmentPlanStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const treatmentVisitStatusLabels: Record<TreatmentVisitStatus, string> =
  {
    PENDING: "Pending",
    REMINDER_SENT: "Reminder sent",
    CONFIRMED: "Confirmed",
    RESCHEDULED: "Rescheduled",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_RESPONSE: "No response",
  };

const treatmentTypeSchema = z.nativeEnum(TreatmentType);
const visitStatusSchema = z.nativeEnum(TreatmentVisitStatus);
const clinicDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid visit date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid visit date.");

const notesSchema = z
  .string()
  .trim()
  .max(5000, "Notes must be 5,000 characters or fewer.")
  .transform((notes) => notes || null);

const planDetailsSchema = z
  .object({
    type: treatmentTypeSchema,
    customName: z.string().trim().max(160).default(""),
    notes: notesSchema,
  })
  .superRefine((input, context) => {
    if (input.type === TreatmentType.CUSTOM && input.customName.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["customName"],
        message: "Enter a custom treatment name.",
      });
    }
  })
  .transform(({ type, customName, ...rest }) => ({
    ...rest,
    type,
    name:
      type === TreatmentType.CUSTOM ? customName : treatmentTypeLabels[type],
  }));

export const createTreatmentPlanSchema = planDetailsSchema
  .and(
    z.object({
      totalVisits: z.coerce
        .number()
        .int()
        .min(1, "A plan needs at least one visit.")
        .max(
          MAX_TREATMENT_VISITS,
          `Plans can have at most ${MAX_TREATMENT_VISITS} visits.`,
        ),
      dueDates: z.array(clinicDateSchema).min(1).max(MAX_TREATMENT_VISITS),
    }),
  )
  .refine((input) => input.dueDates.length === input.totalVisits, {
    path: ["totalVisits"],
    message: "Schedule a due date for every visit.",
  });

export const updateTreatmentPlanSchema = planDetailsSchema.and(
  z.object({
    totalVisits: z.coerce
      .number()
      .int()
      .min(1, "A plan needs at least one visit.")
      .max(
        MAX_TREATMENT_VISITS,
        `Plans can have at most ${MAX_TREATMENT_VISITS} visits.`,
      ),
    additionalDueDates: z.array(clinicDateSchema).max(MAX_TREATMENT_VISITS),
  }),
);

export const treatmentVisitStatusInputSchema = z.object({
  status: visitStatusSchema,
});

export const rescheduleTreatmentVisitSchema = z.object({
  dueDate: clinicDateSchema,
});

export type CreateTreatmentPlanInput = z.output<
  typeof createTreatmentPlanSchema
>;
export type UpdateTreatmentPlanInput = z.output<
  typeof updateTreatmentPlanSchema
>;

export function toDatabaseDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

export function toClinicDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatClinicDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function getClinicToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

const terminalVisitStatuses = new Set<TreatmentVisitStatus>([
  TreatmentVisitStatus.COMPLETED,
]);

const allowedVisitTransitions: Record<
  TreatmentVisitStatus,
  ReadonlySet<TreatmentVisitStatus>
> = {
  PENDING: new Set([
    TreatmentVisitStatus.REMINDER_SENT,
    TreatmentVisitStatus.CONFIRMED,
    TreatmentVisitStatus.RESCHEDULED,
    TreatmentVisitStatus.COMPLETED,
    TreatmentVisitStatus.CANCELLED,
    TreatmentVisitStatus.NO_RESPONSE,
  ]),
  REMINDER_SENT: new Set([
    TreatmentVisitStatus.PENDING,
    TreatmentVisitStatus.CONFIRMED,
    TreatmentVisitStatus.RESCHEDULED,
    TreatmentVisitStatus.COMPLETED,
    TreatmentVisitStatus.CANCELLED,
    TreatmentVisitStatus.NO_RESPONSE,
  ]),
  CONFIRMED: new Set([
    TreatmentVisitStatus.PENDING,
    TreatmentVisitStatus.REMINDER_SENT,
    TreatmentVisitStatus.RESCHEDULED,
    TreatmentVisitStatus.COMPLETED,
    TreatmentVisitStatus.CANCELLED,
    TreatmentVisitStatus.NO_RESPONSE,
  ]),
  RESCHEDULED: new Set([
    TreatmentVisitStatus.PENDING,
    TreatmentVisitStatus.REMINDER_SENT,
    TreatmentVisitStatus.CONFIRMED,
    TreatmentVisitStatus.COMPLETED,
    TreatmentVisitStatus.CANCELLED,
    TreatmentVisitStatus.NO_RESPONSE,
  ]),
  NO_RESPONSE: new Set([
    TreatmentVisitStatus.PENDING,
    TreatmentVisitStatus.REMINDER_SENT,
    TreatmentVisitStatus.CONFIRMED,
    TreatmentVisitStatus.RESCHEDULED,
    TreatmentVisitStatus.COMPLETED,
    TreatmentVisitStatus.CANCELLED,
  ]),
  CANCELLED: new Set([
    TreatmentVisitStatus.PENDING,
    TreatmentVisitStatus.RESCHEDULED,
  ]),
  COMPLETED: new Set(),
};

export function canTransitionTreatmentVisit(
  current: TreatmentVisitStatus,
  next: TreatmentVisitStatus,
): boolean {
  return (
    current === next ||
    (!terminalVisitStatuses.has(current) &&
      allowedVisitTransitions[current].has(next))
  );
}

export function validateAdditionalVisits(
  requestedTotal: number,
  existingVisitCount: number,
  dueDates: readonly string[],
): boolean {
  return (
    requestedTotal >= existingVisitCount &&
    dueDates.length === requestedTotal - existingVisitCount
  );
}
