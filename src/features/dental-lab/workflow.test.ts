import assert from "node:assert/strict";
import test from "node:test";

import { DentalLabOrderStatus } from "@prisma/client";

import { canTransitionDentalLabOrder } from "@/features/dental-lab/workflow";

test("allows a work order to move through the normal lab lifecycle", () => {
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.DRAFT, DentalLabOrderStatus.SENT_TO_LAB), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.SENT_TO_LAB, DentalLabOrderStatus.ACCEPTED), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.ACCEPTED, DentalLabOrderStatus.IN_PROGRESS), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.IN_PROGRESS, DentalLabOrderStatus.READY), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.READY, DentalLabOrderStatus.DISPATCHED), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.DISPATCHED, DentalLabOrderStatus.RECEIVED), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.RECEIVED, DentalLabOrderStatus.FITTED), true);
});

test("allows a remake to be returned to the laboratory", () => {
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.IN_PROGRESS, DentalLabOrderStatus.REMAKE_REQUESTED), true);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.REMAKE_REQUESTED, DentalLabOrderStatus.SENT_TO_LAB), true);
});

test("rejects skipped, backwards, and terminal-state transitions", () => {
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.DRAFT, DentalLabOrderStatus.FITTED), false);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.FITTED, DentalLabOrderStatus.IN_PROGRESS), false);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.CANCELLED, DentalLabOrderStatus.SENT_TO_LAB), false);
  assert.equal(canTransitionDentalLabOrder(DentalLabOrderStatus.FITTED, DentalLabOrderStatus.CANCELLED), false);
});
