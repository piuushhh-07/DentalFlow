import {
  AppointmentStatus,
  FinancialEntryType,
  PreventiveRecallStatus,
} from "@prisma/client";

import {
  getClinicToday,
  isRecallOverdue,
  recallStatusLabels,
} from "@/features/recalls/lib/recall-validation";
import { financialEntryTypeLabels } from "@/features/treatments/lib/treatment-finance-validation";

export type Patient360TimelineItem = Readonly<{
  id: string;
  occurredAt: Date;
  kind: string;
  title: string;
  description?: string;
  href: string;
}>;

export type Patient360MedicalAlerts = Readonly<{
  allergies: string | null;
  medicalHistory: string | null;
}>;

export type Patient360RecallPresentation = Readonly<{
  label: string;
  tone: "overdue" | "upcoming" | "due-today" | "positive" | "neutral";
}>;

export type Patient360AppointmentStatusPresentation = Readonly<{
  label: string;
  tone: "cancelled" | "positive" | "warning" | "neutral";
}>;

export function getPatient360FinancialEntryLabel(
  entryType: FinancialEntryType,
): string {
  return financialEntryTypeLabels[entryType];
}

export function getPatient360PaymentCount(
  entries: readonly Readonly<{ entryType: FinancialEntryType }>[],
): number {
  return entries.filter(
    (entry) => entry.entryType === FinancialEntryType.PAYMENT,
  ).length;
}

export function getPatient360RecallPresentation(
  status: PreventiveRecallStatus,
  dueDate: Date,
  clinicToday = getClinicToday(),
): Patient360RecallPresentation {
  const clinicDate = new Date(`${clinicToday}T00:00:00.000Z`);
  const hasValidClinicDate =
    /^\d{4}-\d{2}-\d{2}$/.test(clinicToday) &&
    Number.isFinite(clinicDate.getTime()) &&
    clinicDate.toISOString().slice(0, 10) === clinicToday;

  if (
    status === PreventiveRecallStatus.ACTIVE &&
    Number.isFinite(dueDate.getTime()) &&
    hasValidClinicDate
  ) {
    if (isRecallOverdue(dueDate, status, clinicToday)) {
      return { label: "Overdue", tone: "overdue" };
    }

    if (dueDate.toISOString().slice(0, 10) === clinicToday) {
      return { label: "Due today", tone: "due-today" };
    }

    return { label: "Upcoming", tone: "upcoming" };
  }

  const tone =
    status === PreventiveRecallStatus.COMPLETED ? "positive" : "neutral";
  return { label: recallStatusLabels[status], tone };
}

export function getPatient360AppointmentStatusPresentation(
  status: AppointmentStatus,
): Patient360AppointmentStatusPresentation {
  switch (status) {
    case AppointmentStatus.CANCELLED:
      return { label: "Cancelled", tone: "cancelled" };
    case AppointmentStatus.COMPLETED:
      return { label: "Completed", tone: "positive" };
    case AppointmentStatus.NO_SHOW:
      return { label: "No-show", tone: "warning" };
    case AppointmentStatus.IN_PROGRESS:
      return { label: "In progress", tone: "warning" };
    case AppointmentStatus.CHECKED_IN:
      return { label: "Checked in", tone: "positive" };
    case AppointmentStatus.CONFIRMED:
      return { label: "Confirmed", tone: "positive" };
    case AppointmentStatus.SCHEDULED:
      return { label: "Scheduled", tone: "neutral" };
  }
}

export function getPatient360MedicalAlerts<T extends Patient360MedicalAlerts>(
  records: readonly T[],
): Patient360MedicalAlerts {
  const latestRecord = records[0];
  return {
    allergies: latestRecord?.allergies ?? null,
    medicalHistory: latestRecord?.medicalHistory ?? null,
  };
}

export function buildPatient360Timeline(
  items: readonly Patient360TimelineItem[],
  limit = 30,
): Patient360TimelineItem[] {
  return [...items]
    .sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit));
}
