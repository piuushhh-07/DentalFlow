import assert from "node:assert/strict";
import test from "node:test";

import { clinicLocalTimeToUtc } from "./attendance-time";

test("converts India clinic local time to UTC", () => {
  assert.equal(
    clinicLocalTimeToUtc("2026-11-17", "09:30", "Asia/Kolkata").toISOString(),
    "2026-11-17T04:00:00.000Z",
  );
});

test("converts a daylight-saving-aware clinic time", () => {
  assert.equal(
    clinicLocalTimeToUtc("2026-01-15", "09:30", "America/New_York").toISOString(),
    "2026-01-15T14:30:00.000Z",
  );
});
