import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PreventiveRecallStatus, TreatmentVisitStatus } from "@prisma/client";

import {
  buildFollowUpPagination,
  followUpSearchSchema,
  getClinicToday,
  isDueOnClinicDate,
  isOverdueOnClinicDate,
  queueItemBelongsToClinic,
  recallReminderSentTabIncludesRecall,
  treatmentStatusesForTab,
} from "@/features/follow-ups/lib/follow-up-validation";

describe("daily follow-up queue rules", () => {
  it("uses the Asia/Kolkata calendar date and handles date boundaries", () => {
    const justBeforeLocalMidnight = new Date("2026-10-15T18:29:59.999Z");
    const localMidnight = new Date("2026-10-15T18:30:00.000Z");
    assert.equal(getClinicToday(justBeforeLocalMidnight), "2026-10-15");
    assert.equal(getClinicToday(localMidnight), "2026-10-16");

    const today = "2026-10-16";
    assert.equal(
      isDueOnClinicDate(new Date("2026-10-16T00:00:00.000Z"), today),
      true,
    );
    assert.equal(
      isOverdueOnClinicDate(new Date("2026-10-15T00:00:00.000Z"), today),
      true,
    );
    assert.equal(
      isOverdueOnClinicDate(new Date("2026-10-16T00:00:00.000Z"), today),
      false,
    );
  });

  it("defines status tabs without including cancelled visits", () => {
    assert.deepEqual(treatmentStatusesForTab("reminder-sent"), [
      TreatmentVisitStatus.REMINDER_SENT,
    ]);
    assert.deepEqual(treatmentStatusesForTab("confirmed"), [
      TreatmentVisitStatus.CONFIRMED,
    ]);
    assert.deepEqual(treatmentStatusesForTab("no-response"), [
      TreatmentVisitStatus.NO_RESPONSE,
    ]);
    assert.deepEqual(treatmentStatusesForTab("completed"), [
      TreatmentVisitStatus.COMPLETED,
    ]);
    assert.equal(
      treatmentStatusesForTab("overdue").includes(
        TreatmentVisitStatus.CANCELLED,
      ),
      false,
    );
    assert.equal(
      treatmentStatusesForTab("due-today").includes(
        TreatmentVisitStatus.COMPLETED,
      ),
      false,
    );
  });

  it("includes recall reminders only in the reminder-sent tab", () => {
    assert.equal(recallReminderSentTabIncludesRecall("reminder-sent"), true);
    assert.equal(recallReminderSentTabIncludesRecall("due-today"), false);
    assert.equal(
      Object.values(PreventiveRecallStatus).includes("CANCELLED"),
      true,
    );
  });

  it("clamps pagination to a valid page", () => {
    const pagination = buildFollowUpPagination(25, 999);
    assert.equal(pagination.page, 3);
    assert.equal(pagination.offset, 20);
    assert.equal(pagination.hasPreviousPage, true);
    assert.equal(pagination.hasNextPage, false);
  });

  it("validates tabs, search length and requested pages", () => {
    assert.equal(
      followUpSearchSchema.safeParse({
        tab: "overdue",
        query: "Mira",
        page: "2",
      }).success,
      true,
    );
    assert.equal(
      followUpSearchSchema.safeParse({
        tab: "arbitrary",
        page: "1",
      }).success,
      false,
    );
  });

  it("does not expose queue records to another clinic", () => {
    assert.equal(
      queueItemBelongsToClinic({ clinicId: "clinic-one" }, "clinic-one"),
      true,
    );
    assert.equal(
      queueItemBelongsToClinic({ clinicId: "clinic-one" }, "clinic-two"),
      false,
    );
    assert.equal(queueItemBelongsToClinic(null, "clinic-one"), false);
  });
});
