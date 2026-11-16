import assert from "node:assert/strict";
import test from "node:test";

import { DentalLabOrderStatus } from "@prisma/client";

import { canTransitionDentalLabOrder } from "@/features/dental-lab/workflow";

const validTransitions: Array<[DentalLabOrderStatus, DentalLabOrderStatus]> = [
  ["DRAFT", "SENT_TO_LAB"],
  ["DRAFT", "CANCELLED"],
  ["SENT_TO_LAB", "ACCEPTED"],
  ["SENT_TO_LAB", "IN_PROGRESS"],
  ["SENT_TO_LAB", "CANCELLED"],
  ["ACCEPTED", "IN_PROGRESS"],
  ["ACCEPTED", "CANCELLED"],
  ["IN_PROGRESS", "READY"],
  ["IN_PROGRESS", "REMAKE_REQUESTED"],
  ["IN_PROGRESS", "CANCELLED"],
  ["READY", "DISPATCHED"],
  ["READY", "RECEIVED"],
  ["READY", "REMAKE_REQUESTED"],
  ["DISPATCHED", "RECEIVED"],
  ["DISPATCHED", "REMAKE_REQUESTED"],
  ["RECEIVED", "FITTED"],
  ["RECEIVED", "REMAKE_REQUESTED"],
  ["FITTED", "REMAKE_REQUESTED"],
  ["REMAKE_REQUESTED", "SENT_TO_LAB"],
  ["REMAKE_REQUESTED", "CANCELLED"],
];

const invalidTransitions: Array<[DentalLabOrderStatus, DentalLabOrderStatus]> = [
  ["DRAFT", "ACCEPTED"],
  ["DRAFT", "IN_PROGRESS"],
  ["DRAFT", "READY"],
  ["DRAFT", "DISPATCHED"],
  ["DRAFT", "RECEIVED"],
  ["DRAFT", "FITTED"],
  ["SENT_TO_LAB", "DRAFT"],
  ["SENT_TO_LAB", "READY"],
  ["SENT_TO_LAB", "FITTED"],
  ["ACCEPTED", "DRAFT"],
  ["ACCEPTED", "READY"],
  ["IN_PROGRESS", "DRAFT"],
  ["IN_PROGRESS", "ACCEPTED"],
  ["READY", "DRAFT"],
  ["READY", "IN_PROGRESS"],
  ["DISPATCHED", "READY"],
  ["DISPATCHED", "FITTED"],
  ["RECEIVED", "IN_PROGRESS"],
  ["RECEIVED", "DISPATCHED"],
  ["FITTED", "IN_PROGRESS"],
  ["FITTED", "CANCELLED"],
  ["REMAKE_REQUESTED", "READY"],
  ["REMAKE_REQUESTED", "FITTED"],
  ["CANCELLED", "DRAFT"],
  ["CANCELLED", "SENT_TO_LAB"],
  ["CANCELLED", "REMAKE_REQUESTED"],
];

test("allows every documented dental lab lifecycle transition", () => {
  for (const [current, next] of validTransitions) {
    assert.equal(
      canTransitionDentalLabOrder(current, next),
      true,
      `Expected ${current} -> ${next} to be allowed`,
    );
  }
});

test("rejects skipped, backwards, and terminal-state transitions", () => {
  for (const [current, next] of invalidTransitions) {
    assert.equal(
      canTransitionDentalLabOrder(current, next),
      false,
      `Expected ${current} -> ${next} to be rejected`,
    );
  }
});

test("rejects transitions from a status back to itself", () => {
  for (const status of Object.values(DentalLabOrderStatus)) {
    assert.equal(
      canTransitionDentalLabOrder(status, status),
      false,
      `Expected self-transition for ${status} to be rejected`,
    );
  }
});

test("cancelled orders are terminal", () => {
  for (const next of Object.values(DentalLabOrderStatus)) {
    assert.equal(
      canTransitionDentalLabOrder(DentalLabOrderStatus.CANCELLED, next),
      false,
      `Expected CANCELLED -> ${next} to be rejected`,
    );
  }
});
