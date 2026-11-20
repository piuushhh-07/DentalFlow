import type { VendorBillStatus } from "@prisma/client";

export type VendorBillPaymentDecision =
  "ACCEPT" | "DUPLICATE" | "VOID" | "OVERPAYMENT";

export function getVendorBillStatus(
  totalMinor: number,
  paidMinor: number,
): VendorBillStatus {
  if (paidMinor <= 0) return "OPEN";
  if (paidMinor < totalMinor) return "PARTIALLY_PAID";
  return "PAID";
}

export function evaluateVendorBillPayment({
  isDuplicate,
  isVoid,
  totalMinor,
  paidMinor,
  paymentMinor,
}: {
  isDuplicate: boolean;
  isVoid: boolean;
  totalMinor: number;
  paidMinor: number;
  paymentMinor: number;
}): VendorBillPaymentDecision {
  if (isDuplicate) return "DUPLICATE";
  if (isVoid) return "VOID";
  if (paidMinor + paymentMinor > totalMinor) return "OVERPAYMENT";
  return "ACCEPT";
}
