import { DentalLabOrderStatus } from "@prisma/client";

const allowedTransitions: Record<DentalLabOrderStatus, readonly DentalLabOrderStatus[]> = {
  DRAFT: ["SENT_TO_LAB", "CANCELLED"],
  SENT_TO_LAB: ["ACCEPTED", "IN_PROGRESS", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY", "REMAKE_REQUESTED", "CANCELLED"],
  READY: ["DISPATCHED", "RECEIVED", "REMAKE_REQUESTED"],
  DISPATCHED: ["RECEIVED", "REMAKE_REQUESTED"],
  RECEIVED: ["FITTED", "REMAKE_REQUESTED"],
  FITTED: ["REMAKE_REQUESTED"],
  REMAKE_REQUESTED: ["SENT_TO_LAB", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionDentalLabOrder(
  current: DentalLabOrderStatus,
  next: DentalLabOrderStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}
