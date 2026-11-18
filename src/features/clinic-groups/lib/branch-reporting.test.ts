import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBranchReportRange } from "@/features/clinic-groups/lib/branch-reporting";

const now = new Date("2026-11-18T12:00:00.000Z");

describe("branch report date filters", () => {
  it("supports rolling 7, 30 and 90 day periods in each branch timezone", () => {
    const seven = resolveBranchReportRange(now, "Asia/Kolkata", "7");
    const thirty = resolveBranchReportRange(now, "Asia/Kolkata", "30");
    const ninety = resolveBranchReportRange(now, "Asia/Kolkata", "90");

    assert.equal(seven.range.startDate, "2026-11-12");
    assert.equal(seven.range.endDate, "2026-11-18");
    assert.equal(thirty.range.startDate, "2026-10-20");
    assert.equal(ninety.range.startDate, "2026-08-21");
    assert.equal(ninety.range.timeZone, "Asia/Kolkata");
  });

  it("supports month-to-date boundaries in the branch timezone", () => {
    const result = resolveBranchReportRange(now, "Asia/Kolkata", "month");
    assert.equal(result.range.startDate, "2026-11-01");
    assert.equal(result.range.endDate, "2026-11-18");
    assert.equal(result.error, null);
  });

  it("supports custom date ranges and converts local midnight correctly", () => {
    const result = resolveBranchReportRange(
      now,
      "Asia/Kolkata",
      "custom",
      "2026-10-01",
      "2026-10-31",
    );
    assert.equal(result.error, null);
    assert.equal(result.range.startAt.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(result.range.endExclusiveAt.toISOString(), "2026-10-31T18:30:00.000Z");
  });

  it("rejects missing, malformed, reversed and overlong custom ranges", () => {
    for (const result of [
      resolveBranchReportRange(now, "Asia/Kolkata", "custom"),
      resolveBranchReportRange(now, "Asia/Kolkata", "custom", "2026-02-30", "2026-03-01"),
      resolveBranchReportRange(now, "Asia/Kolkata", "custom", "2026-11-19", "2026-11-18"),
      resolveBranchReportRange(now, "Asia/Kolkata", "custom", "2025-11-18", "2026-11-19"),
    ]) {
      assert.match(result.error ?? "", /no more than 366 days/);
      assert.equal(result.range.startDate, "2026-10-20");
      assert.equal(result.range.endDate, "2026-11-18");
    }
  });

  it("falls back to 30 days for an unknown preset", () => {
    const result = resolveBranchReportRange(now, "Asia/Kolkata", "all-time");
    assert.equal(result.preset, "30");
    assert.equal(result.range.startDate, "2026-10-20");
  });
});
