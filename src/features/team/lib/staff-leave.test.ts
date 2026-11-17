import assert from "node:assert/strict";
import test from "node:test";

import {
  clinicDateInTimeZone,
  inclusiveLeaveDays,
  isValidDateOnly,
  leaveDateRangesOverlap,
} from "./staff-leave";

test("uses the clinic timezone for the current leave date", () => {
  assert.equal(
    clinicDateInTimeZone(new Date("2026-11-17T20:00:00.000Z"), "Asia/Kolkata"),
    "2026-11-18",
  );
});

test("validates real calendar dates", () => {
  assert.equal(isValidDateOnly("2026-02-28"), true);
  assert.equal(isValidDateOnly("2026-02-30"), false);
  assert.equal(isValidDateOnly("2026-2-02"), false);
});

test("detects intersecting leave date ranges including shared endpoints", () => {
  assert.equal(leaveDateRangesOverlap("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-15"), true);
  assert.equal(leaveDateRangesOverlap("2026-11-10", "2026-11-12", "2026-11-13", "2026-11-15"), false);
});

test("counts leave days inclusively", () => {
  assert.equal(inclusiveLeaveDays("2026-11-17", "2026-11-17"), 1);
  assert.equal(inclusiveLeaveDays("2026-11-17", "2026-11-19"), 3);
});
