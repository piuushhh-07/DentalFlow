import assert from "node:assert/strict";
import test from "node:test";

import {
  addCalendarDays,
  filterCalendarAppointments,
  getAppointmentCalendarRange,
  getAppointmentPosition,
  getAppointmentTimeAtCalendarPosition,
  getCalendarDateOffset,
  getClinicDateRangeBounds,
  getCalendarWeekStart,
  navigateAppointmentCalendar,
} from "@/features/appointments/lib/appointment-calendar";

test("calendar ranges cover the selected day, Monday-to-Sunday week, and full month grid", () => {
  assert.deepEqual(getAppointmentCalendarRange("2026-11-11", "day"), {
    startDate: "2026-11-11",
    endDate: "2026-11-11",
  });
  assert.deepEqual(getAppointmentCalendarRange("2026-11-11", "week"), {
    startDate: "2026-11-09",
    endDate: "2026-11-15",
  });
  assert.deepEqual(getAppointmentCalendarRange("2026-11-11", "month"), {
    startDate: "2026-10-26",
    endDate: "2026-12-06",
  });
});

test("clinic date-range query bounds include the full end date in Asia/Kolkata", () => {
  const bounds = getClinicDateRangeBounds("2026-11-09", "2026-11-15");

  assert.equal(bounds.startAt.toISOString(), "2026-11-08T18:30:00.000Z");
  assert.equal(bounds.endAt.toISOString(), "2026-11-15T18:30:00.000Z");
});

test("calendar navigation advances by day, week, or month", () => {
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(getCalendarWeekStart("2026-11-15"), "2026-11-09");
  assert.equal(
    navigateAppointmentCalendar("2026-11-15", "day", 1),
    "2026-11-16",
  );
  assert.equal(
    navigateAppointmentCalendar("2026-11-15", "week", -1),
    "2026-11-08",
  );
  assert.equal(
    navigateAppointmentCalendar("2026-11-15", "month", 1),
    "2026-12-01",
  );
});

test("calendar filters combine dentist, chair, and status", () => {
  const appointments = [
    { id: "one", dentistId: "d1", chairId: "c1", status: "SCHEDULED" },
    { id: "two", dentistId: "d1", chairId: "c2", status: "CONFIRMED" },
    { id: "three", dentistId: "d2", chairId: "c1", status: "SCHEDULED" },
  ];

  assert.deepEqual(
    filterCalendarAppointments(appointments, {
      dentistId: "d1",
      chairId: "c1",
      status: "SCHEDULED",
    }).map(({ id }) => id),
    ["one"],
  );
  assert.equal(
    filterCalendarAppointments(appointments, {
      dentistId: "",
      chairId: "",
      status: "",
    }).length,
    3,
  );
});

test("appointment placement maps clinic day times onto the visible grid", () => {
  const position = getAppointmentPosition("09:30", 30);
  assert.equal(position.topPercent, (150 / 1020) * 100);
  assert.equal(position.heightPercent, (30 / 1020) * 100);
  assert.equal(
    getAppointmentTimeAtCalendarPosition(250, { top: 100, height: 1020 }),
    "09:30",
  );
  assert.equal(getCalendarDateOffset("2026-11-11", "2026-11-09"), 2);
});
