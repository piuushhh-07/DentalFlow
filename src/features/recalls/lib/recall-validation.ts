import { PreventiveRecallStatus, PreventiveRecallType } from "@prisma/client";
import { z } from "zod";

export const RECALL_PAGE_SIZE = 10;

export const recallTypeLabels: Record<PreventiveRecallType, string> = {
  SIX_MONTH_CHECKUP: "Six-month checkup",
  CLEANING: "Cleaning",
  CUSTOM: "Custom recall",
};

export const recallStatusLabels: Record<PreventiveRecallStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export const recallDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid due date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid due date.");

const baseRecallSchema = z.object({
  type: z.nativeEnum(PreventiveRecallType),
  customName: z.string().trim().max(160).default(""),
  intervalMonths: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(120)])
    .transform((value) => (value === "" ? null : value)),
  dueDate: recallDateSchema,
  notes: z
    .string()
    .trim()
    .max(5000, "Notes must be 5,000 characters or fewer.")
    .transform((value) => value || null),
});

export const recallInputSchema = baseRecallSchema
  .superRefine((input, context) => {
    if (input.type === PreventiveRecallType.CUSTOM) {
      if (input.customName.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["customName"],
          message: "Enter a name for the custom recall.",
        });
      }
      if (input.intervalMonths === null) {
        context.addIssue({
          code: "custom",
          path: ["intervalMonths"],
          message: "Choose an interval from 1 to 120 months.",
        });
      }
    }
  })
  .transform((input) => ({
    ...input,
    customName:
      input.type === PreventiveRecallType.CUSTOM ? input.customName : null,
    intervalMonths:
      input.type === PreventiveRecallType.SIX_MONTH_CHECKUP
        ? 6
        : input.intervalMonths,
  }));

export const recallListQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  filter: z
    .enum(["all", "due", "overdue", "completed", "paused", "cancelled"])
    .default("all"),
  page: z.coerce.number().int().min(1).default(1),
});

export const recallIdSchema = z.string().uuid();

export type RecallInput = z.output<typeof recallInputSchema>;
export type RecallFilter = z.output<typeof recallListQuerySchema>["filter"];

export function toDatabaseDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

export function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatRecallDate(date: Date): string {
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

export function isRecallOverdue(
  dueDate: Date,
  status: PreventiveRecallStatus,
  clinicToday = getClinicToday(),
): boolean {
  return (
    status === PreventiveRecallStatus.ACTIVE &&
    dueDate.toISOString().slice(0, 10) < clinicToday
  );
}

export function canTransitionRecallStatus(
  current: PreventiveRecallStatus,
  next: PreventiveRecallStatus,
): boolean {
  if (current === next) return true;
  if (current === PreventiveRecallStatus.COMPLETED) return false;
  return true;
}

export function canRescheduleRecall(status: PreventiveRecallStatus): boolean {
  return status === PreventiveRecallStatus.ACTIVE;
}

export function recallBelongsToClinic(
  recall: Readonly<{ clinicId: string }> | null,
  clinicId: string,
): boolean {
  return recall !== null && recall.clinicId === clinicId;
}

export function getRecallPagination(totalCount: number, requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / RECALL_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return {
    page,
    pageSize: RECALL_PAGE_SIZE,
    totalCount,
    totalPages,
    skip: (page - 1) * RECALL_PAGE_SIZE,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

export function isDuplicateActiveRecall(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002" ||
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null ||
    !("target" in error.meta)
  ) {
    return false;
  }

  const target = error.meta.target;
  if (typeof target === "string") {
    return target.includes("preventive_recalls_active_cycle_key");
  }
  if (!Array.isArray(target)) return false;

  const fields = target.filter(
    (field): field is string => typeof field === "string",
  );
  return (
    fields.some((field) =>
      field.includes("preventive_recalls_active_cycle_key"),
    ) ||
    (fields.some((field) => field.includes("clinicId")) &&
      fields.some((field) => field.includes("patientId")) &&
      fields.some((field) => field.includes("type")) &&
      fields.some((field) => field.includes("dueDate")) &&
      !fields.some((field) => field.includes("id")))
  );
}
