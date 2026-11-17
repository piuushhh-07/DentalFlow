import { describe, expect, it } from "vitest";

import { clinicLocalTimeToUtc } from "./attendance-time";

describe("clinicLocalTimeToUtc", () => {
  it("converts India clinic local time to UTC", () => {
    expect(clinicLocalTimeToUtc("2026-11-17", "09:30", "Asia/Kolkata").toISOString())
      .toBe("2026-11-17T04:00:00.000Z");
  });

  it("converts a daylight-saving-aware clinic time", () => {
    expect(clinicLocalTimeToUtc("2026-01-15", "09:30", "America/New_York").toISOString())
      .toBe("2026-01-15T14:30:00.000Z");
  });
});
