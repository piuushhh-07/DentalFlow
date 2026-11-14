import assert from "node:assert/strict";
import test from "node:test";

import {
  getAppointmentResourceLockKeys,
} from "@/features/appointments/lib/appointment-resource-lock";

test("appointment resource locks are deterministic and ordered", () => {
  const keys = getAppointmentResourceLockKeys(
    "clinic-a",
    "dentist-a",
    "chair-a",
  );

  assert.deepEqual(keys, [...keys].sort());
  assert.equal(keys.length, 2);
  assert.ok(keys.some((key) => key === "clinic-a:dentist:dentist-a"));
  assert.ok(keys.some((key) => key === "clinic-a:chair:chair-a"));
});

test("appointment resource locks are isolated by clinic", () => {
  const clinicA = getAppointmentResourceLockKeys(
    "clinic-a",
    "dentist-a",
    "chair-a",
  );
  const clinicB = getAppointmentResourceLockKeys(
    "clinic-b",
    "dentist-a",
    "chair-a",
  );

  assert.equal(clinicA.some((key) => clinicB.includes(key)), false);
});

test("shared dentist or chair produces a shared lock key", () => {
  const first = getAppointmentResourceLockKeys(
    "clinic-a",
    "dentist-a",
    "chair-a",
  );
  const second = getAppointmentResourceLockKeys(
    "clinic-a",
    "dentist-a",
    "chair-b",
  );
  const third = getAppointmentResourceLockKeys(
    "clinic-a",
    "dentist-b",
    "chair-a",
  );

  assert.ok(first.some((key) => second.includes(key)));
  assert.ok(first.some((key) => third.includes(key)));
});
