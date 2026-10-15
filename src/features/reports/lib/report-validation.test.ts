import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatReportDateRange,
  getClinicReportDateRange,
  isDateInReportRange,
  REPORT_RANGE_DAYS,
} from "@/features/reports/lib/report-validation";

type ReportFixtures = Readonly<{
  patients: readonly Readonly<{ id: string; clinicId: string }>[];
  treatmentVisits: readonly Readonly<{
    id: string;
    clinicId: string;
    status: string;
    dueDate: string;
    planStatus: string;
  }>[];
  preventiveRecalls: readonly Readonly<{
    id: string;
    clinicId: string;
    status: string;
    dueDate: string;
  }>[];
  manuallyRecordedWhatsAppMessages: readonly Readonly<{
    id: string;
    clinicId: string;
    status: string;
    confirmedAt: Date | null;
  }>[];
  treatmentPlans: readonly Readonly<{
    id: string;
    clinicId: string;
    status: string;
    completedAt: Date | null;
  }>[];
}>;

function countMatchingRows<T extends Readonly<{ clinicId: string }>>(
  rows: readonly T[],
  clinicId: string,
  predicate: (row: T) => boolean,
): number {
  return rows.filter((row) => row.clinicId === clinicId && predicate(row))
    .length;
}

function calculateReportFixtureCounts(
  fixtures: ReportFixtures,
  clinicId: string,
  range: ReturnType<typeof getClinicReportDateRange>,
) {
  const pendingVisitStatuses = new Set(["PENDING", "RESCHEDULED"]);
  const unresolvedVisitStatuses = new Set([
    "PENDING",
    "REMINDER_SENT",
    "CONFIRMED",
    "RESCHEDULED",
    "NO_RESPONSE",
  ]);
  return {
    activePatients: countMatchingRows(fixtures.patients, clinicId, () => true),
    pendingTreatmentVisits: countMatchingRows(
      fixtures.treatmentVisits,
      clinicId,
      (row) =>
        pendingVisitStatuses.has(row.status) &&
        row.dueDate >= range.endDate &&
        row.planStatus !== "CANCELLED",
    ),
    overdueTreatmentVisits: countMatchingRows(
      fixtures.treatmentVisits,
      clinicId,
      (row) =>
        unresolvedVisitStatuses.has(row.status) &&
        row.dueDate < range.endDate &&
        row.planStatus !== "CANCELLED",
    ),
    pendingPreventiveRecalls: countMatchingRows(
      fixtures.preventiveRecalls,
      clinicId,
      (row) => row.status === "ACTIVE" && row.dueDate >= range.endDate,
    ),
    overduePreventiveRecalls: countMatchingRows(
      fixtures.preventiveRecalls,
      clinicId,
      (row) => row.status === "ACTIVE" && row.dueDate < range.endDate,
    ),
    manuallyRecordedWhatsAppMessages: countMatchingRows(
      fixtures.manuallyRecordedWhatsAppMessages,
      clinicId,
      (row) =>
        row.status === "MANUALLY_RECORDED_SENT" &&
        row.confirmedAt !== null &&
        row.confirmedAt >= range.startAt &&
        row.confirmedAt < range.endExclusiveAt,
    ),
    confirmedFollowUps: countMatchingRows(
      fixtures.treatmentVisits,
      clinicId,
      (row) =>
        row.status === "CONFIRMED" &&
        row.dueDate >= range.startDate &&
        row.dueDate < range.endExclusiveDate &&
        row.planStatus !== "CANCELLED",
    ),
    completedTreatmentPlans: countMatchingRows(
      fixtures.treatmentPlans,
      clinicId,
      (row) =>
        row.status === "COMPLETED" &&
        row.completedAt !== null &&
        row.completedAt >= range.startAt &&
        row.completedAt < range.endExclusiveAt,
    ),
  };
}

describe("clinic report date range", () => {
  it("uses 30 clinic-local calendar days including today", () => {
    const range = getClinicReportDateRange(
      new Date("2026-10-15T18:29:59.999Z"),
      "Asia/Kolkata",
    );
    assert.equal(REPORT_RANGE_DAYS, 30);
    assert.equal(range.endDate, "2026-10-15");
    assert.equal(range.startDate, "2026-09-16");
    assert.equal(range.endExclusiveDate, "2026-10-16");
    assert.equal(range.startAt.toISOString(), "2026-09-15T18:30:00.000Z");
    assert.equal(
      range.endExclusiveAt.toISOString(),
      "2026-10-15T18:30:00.000Z",
    );
  });

  describe("clinic report metric definitions", () => {
    it("counts expected clinic records once and applies date and status boundaries", () => {
      const range = getClinicReportDateRange(
        new Date("2026-10-15T18:29:59.999Z"),
        "Asia/Kolkata",
      );
      const clinicId = "clinic-one";
      const metrics = calculateReportFixtureCounts(
        {
          patients: [
            { id: "patient-1", clinicId },
            { id: "patient-2", clinicId },
            { id: "patient-x", clinicId: "clinic-two" },
          ],
          treatmentVisits: [
            {
              id: "visit-pending-today",
              clinicId,
              status: "PENDING",
              dueDate: "2026-10-15",
              planStatus: "ACTIVE",
            },
            {
              id: "visit-rescheduled-future",
              clinicId,
              status: "RESCHEDULED",
              dueDate: "2026-10-16",
              planStatus: "ACTIVE",
            },
            {
              id: "visit-overdue-reminded",
              clinicId,
              status: "REMINDER_SENT",
              dueDate: "2026-10-14",
              planStatus: "ACTIVE",
            },
            {
              id: "visit-completed",
              clinicId,
              status: "COMPLETED",
              dueDate: "2026-10-14",
              planStatus: "ACTIVE",
            },
            {
              id: "visit-cancelled-plan",
              clinicId,
              status: "PENDING",
              dueDate: "2026-10-17",
              planStatus: "CANCELLED",
            },
            {
              id: "visit-other-clinic",
              clinicId: "clinic-two",
              status: "PENDING",
              dueDate: "2026-10-15",
              planStatus: "ACTIVE",
            },
            {
              id: "visit-confirmed-range",
              clinicId,
              status: "CONFIRMED",
              dueDate: "2026-10-15",
              planStatus: "ACTIVE",
            },
          ],
          preventiveRecalls: [
            {
              id: "recall-pending",
              clinicId,
              status: "ACTIVE",
              dueDate: "2026-10-15",
            },
            {
              id: "recall-overdue",
              clinicId,
              status: "ACTIVE",
              dueDate: "2026-10-14",
            },
            {
              id: "recall-completed",
              clinicId,
              status: "COMPLETED",
              dueDate: "2026-10-14",
            },
            {
              id: "recall-other-clinic",
              clinicId: "clinic-two",
              status: "ACTIVE",
              dueDate: "2026-10-14",
            },
          ],
          manuallyRecordedWhatsAppMessages: [
            {
              id: "message-start",
              clinicId,
              status: "MANUALLY_RECORDED_SENT",
              confirmedAt: range.startAt,
            },
            {
              id: "message-end",
              clinicId,
              status: "MANUALLY_RECORDED_SENT",
              confirmedAt: range.endExclusiveAt,
            },
            {
              id: "message-opened",
              clinicId,
              status: "OPENED_IN_WHATSAPP",
              confirmedAt: range.startAt,
            },
            {
              id: "message-other-clinic",
              clinicId: "clinic-two",
              status: "MANUALLY_RECORDED_SENT",
              confirmedAt: range.startAt,
            },
          ],
          treatmentPlans: [
            {
              id: "plan-completed",
              clinicId,
              status: "COMPLETED",
              completedAt: range.startAt,
            },
            {
              id: "plan-other-clinic",
              clinicId: "clinic-two",
              status: "COMPLETED",
              completedAt: range.startAt,
            },
          ],
        },
        clinicId,
        range,
      );

      assert.deepEqual(metrics, {
        activePatients: 2,
        pendingTreatmentVisits: 2,
        overdueTreatmentVisits: 1,
        pendingPreventiveRecalls: 1,
        overduePreventiveRecalls: 1,
        manuallyRecordedWhatsAppMessages: 1,
        confirmedFollowUps: 1,
        completedTreatmentPlans: 1,
      });
    });

    it("uses the visit due date for confirmed follow-ups and plan completion as a distinct metric", () => {
      const range = getClinicReportDateRange(
        new Date("2026-10-15T18:29:59.999Z"),
        "Asia/Kolkata",
      );
      const metrics = calculateReportFixtureCounts(
        {
          patients: [],
          treatmentVisits: [
            {
              id: "visit",
              clinicId: "clinic-one",
              status: "CONFIRMED",
              dueDate: "2026-09-15",
              planStatus: "ACTIVE",
            },
          ],
          preventiveRecalls: [],
          manuallyRecordedWhatsAppMessages: [],
          treatmentPlans: [
            {
              id: "plan",
              clinicId: "clinic-one",
              status: "COMPLETED",
              completedAt: range.startAt,
            },
          ],
        },
        "clinic-one",
        range,
      );
      assert.equal(metrics.confirmedFollowUps, 0);
      assert.equal(metrics.completedTreatmentPlans, 1);
    });
  });

  it("handles a date crossing local midnight and includes exact boundaries", () => {
    const range = getClinicReportDateRange(
      new Date("2026-10-15T18:30:00.000Z"),
      "Asia/Kolkata",
    );
    assert.equal(range.endDate, "2026-10-16");
    assert.equal(isDateInReportRange(range.startDate, range), true);
    assert.equal(isDateInReportRange(range.endDate, range), true);
    assert.equal(isDateInReportRange(range.endExclusiveDate, range), false);
  });

  it("supports a configured timezone and formats the displayed range", () => {
    const range = getClinicReportDateRange(
      new Date("2026-10-15T23:30:00.000Z"),
      "Asia/Kolkata",
      7,
    );
    assert.equal(range.timeZone, "Asia/Kolkata");
    assert.equal(range.startDate, "2026-10-10");
    assert.equal(range.endDate, "2026-10-16");
    assert.match(formatReportDateRange(range), /10 Oct 2026/);
    assert.match(formatReportDateRange(range), /16 Oct 2026/);
  });
});
