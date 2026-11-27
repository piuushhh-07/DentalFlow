import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWhatsAppReminderCursorFilter,
  getWhatsAppReminderPageCursor,
} from "./whatsapp-reminder-pagination";

describe("WhatsApp reminder keyset pagination", () => {
  const scheduledAt = new Date("2026-12-01T10:00:00.000Z");

  it("does not add a cursor condition to the first page", () => {
    assert.deepEqual(buildWhatsAppReminderCursorFilter(), {});
  });

  it("continues after the last appointment, including equal-time ID tie breaks", () => {
    assert.deepEqual(
      buildWhatsAppReminderCursorFilter({ scheduledAt, id: "appointment-100" }),
      {
        OR: [
          { scheduledAt: { gt: scheduledAt } },
          { scheduledAt, id: { gt: "appointment-100" } },
        ],
      },
    );
  });

  it("uses the final row as the next page cursor", () => {
    const cursor = getWhatsAppReminderPageCursor([
      { scheduledAt, id: "appointment-1" },
      { scheduledAt, id: "appointment-2" },
      { scheduledAt: new Date("2026-12-01T10:15:00.000Z"), id: "appointment-3" },
    ]);

    assert.deepEqual(cursor, {
      scheduledAt: new Date("2026-12-01T10:15:00.000Z"),
      id: "appointment-3",
    });
  });

  it("returns no cursor for an empty page", () => {
    assert.equal(getWhatsAppReminderPageCursor([]), undefined);
  });
});
