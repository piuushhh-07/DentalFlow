import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildBranchTrendPeriods } from "@/features/clinic-groups/lib/branch-trends";

describe("branch financial trend periods", () => {
  it("builds twelve consecutive local calendar months ending in the current month", () => {
    const periods = buildBranchTrendPeriods(new Date("2026-11-18T12:00:00.000Z"), "Asia/Kolkata");
    assert.equal(periods.length, 12);
    assert.equal(periods[0].key, "2025-12");
    assert.equal(periods[0].range.startDate, "2025-12-01");
    assert.equal(periods[0].range.endDate, "2025-12-31");
    assert.equal(periods[11].key, "2026-11");
    assert.equal(periods[11].range.startDate, "2026-11-01");
    assert.equal(periods[11].range.endDate, "2026-11-30");
  });

  it("uses each branch timezone to determine the current month", () => {
    const now = new Date("2026-11-30T20:00:00.000Z");
    const india = buildBranchTrendPeriods(now, "Asia/Kolkata", 2);
    const losAngeles = buildBranchTrendPeriods(now, "America/Los_Angeles", 2);
    assert.equal(india[1].key, "2026-12");
    assert.equal(losAngeles[1].key, "2026-11");
    assert.equal(india[1].range.startAt.toISOString(), "2026-11-30T18:30:00.000Z");
  });

  it("rejects unsupported month counts", () => {
    assert.throws(() => buildBranchTrendPeriods(new Date(), "Asia/Kolkata", 0), RangeError);
    assert.throws(() => buildBranchTrendPeriods(new Date(), "Asia/Kolkata", 25), RangeError);
  });
});
