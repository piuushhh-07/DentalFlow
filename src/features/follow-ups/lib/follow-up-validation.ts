import { PreventiveRecallStatus, TreatmentVisitStatus } from "@prisma/client";
import { z } from "zod";

import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";

export const FOLLOW_UP_PAGE_SIZE = 10;
export const MAX_FOLLOW_UP_PAGE = 100_000;

export const followUpTabs = [
  "due-today",
  "overdue",
  "reminder-sent",
  "confirmed",
  "no-response",
  "completed",
] as const;

export const followUpTabSchema = z.enum(followUpTabs).default("due-today");
export type FollowUpTab = z.output<typeof followUpTabSchema>;

export const followUpSearchSchema = z.object({
  tab: followUpTabSchema,
  query: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(MAX_FOLLOW_UP_PAGE).default(1),
});

type FollowUpQueueItemBase = Readonly<{
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  phoneNumber: string;
  whatsappOptIn: boolean;
  whatsappOptedInAt: Date | null;
  label: string;
  dueDate: Date;
}>;

export type FollowUpQueueItem =
  | (FollowUpQueueItemBase &
      Readonly<{
        kind: "treatment-visit";
        status: TreatmentVisitStatus;
        treatmentPlanId: string;
        visitNumber: number;
        totalVisits: number;
        reminderSent: false;
      }>)
  | (FollowUpQueueItemBase &
      Readonly<{
        kind: "preventive-recall";
        status: PreventiveRecallStatus;
        treatmentPlanId: null;
        visitNumber: null;
        totalVisits: null;
        reminderSent: boolean;
      }>);

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

export function isDueOnClinicDate(dueDate: Date, clinicDate: string): boolean {
  return dueDate.toISOString().slice(0, 10) === clinicDate;
}

export function isOverdueOnClinicDate(
  dueDate: Date,
  clinicDate: string,
): boolean {
  return dueDate.toISOString().slice(0, 10) < clinicDate;
}

export function buildFollowUpPagination(
  totalCount: number,
  requestedPage: number,
  pageSize = FOLLOW_UP_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    offset: (page - 1) * pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

export function treatmentStatusesForTab(
  tab: FollowUpTab,
): readonly TreatmentVisitStatus[] {
  switch (tab) {
    case "due-today":
    case "overdue":
      return [
        TreatmentVisitStatus.PENDING,
        TreatmentVisitStatus.REMINDER_SENT,
        TreatmentVisitStatus.CONFIRMED,
        TreatmentVisitStatus.RESCHEDULED,
        TreatmentVisitStatus.NO_RESPONSE,
      ];
    case "reminder-sent":
      return [TreatmentVisitStatus.REMINDER_SENT];
    case "confirmed":
      return [TreatmentVisitStatus.CONFIRMED];
    case "no-response":
      return [TreatmentVisitStatus.NO_RESPONSE];
    case "completed":
      return [TreatmentVisitStatus.COMPLETED];
  }
}

export function recallReminderSentTabIncludesRecall(tab: FollowUpTab): boolean {
  return tab === "reminder-sent";
}

export function queueItemBelongsToClinic(
  item: Pick<FollowUpQueueItem, "clinicId"> | null,
  clinicId: string,
): boolean {
  return item !== null && item.clinicId === clinicId;
}

export function getFollowUpTabLabel(tab: FollowUpTab): string {
  switch (tab) {
    case "due-today":
      return "Due today";
    case "overdue":
      return "Overdue";
    case "reminder-sent":
      return "Reminder sent";
    case "confirmed":
      return "Confirmed";
    case "no-response":
      return "No response";
    case "completed":
      return "Completed";
  }
}

export function getFollowUpStatusLabel(item: FollowUpQueueItem): string {
  if (item.kind === "preventive-recall" && item.reminderSent) {
    return "Reminder sent";
  }

  const statusLabels: Record<string, string> = {
    PENDING: "Pending",
    REMINDER_SENT: "Reminder sent",
    CONFIRMED: "Confirmed",
    RESCHEDULED: "Rescheduled",
    NO_RESPONSE: "No response",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    ACTIVE: "Active",
  };
  return statusLabels[item.status] ?? item.status;
}

export function getFollowUpTreatmentLabel(item: FollowUpQueueItem): string {
  if (item.kind === "treatment-visit") {
    return `${item.label} · Visit`;
  }

  return item.label;
}

export function formatFollowUpPhone(phoneNumber: string): string {
  const normalized = normalizeIndianPhoneNumber(phoneNumber);
  return normalized
    ? `${normalized.slice(0, 3)} ${normalized.slice(3, 8)} ${normalized.slice(8)}`
    : phoneNumber;
}
