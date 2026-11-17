import assert from "node:assert/strict";
import test from "node:test";

import { attendanceCsvCell, attendanceDurationMinutes, getAttendanceMonthRange } from "./attendance-report";

test("returns an inclusive month start and exclusive next-month boundary", () => {
  const range = getAttendanceMonthRange("2026-12");
  assert.equal(range.startDate.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(range.endDate.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("rejects malformed months", () => {
  assert.throws(() => getAttendanceMonthRange("2026-13"));
  assert.throws(() => getAttendanceMonthRange("2026-1"));
});

test("protects exported CSV cells against spreadsheet formulas", () => {
  assert.equal(attendanceCsvCell("=1+1"), "\"\'=1+1\"");
  assert.equal(attendanceCsvCell('A "quote"'), '"A ""quote"""');
});

test("calculates completed shift duration in whole minutes", () => {
  assert.equal(attendanceDurationMinutes(new Date("2026-11-17T03:30:00.000Z"), new Date("2026-11-17T12:00:00.000Z")), 510);
  assert.equal(attendanceDurationMinutes(null, new Date()), 0);
});