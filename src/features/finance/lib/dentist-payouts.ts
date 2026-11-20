export type DentistPayoutState = "OPEN" | "PARTIALLY_PAID" | "PAID";

export function toMinorUnits(amount: string | number): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Amounts must be finite and non-negative.");
  }
  return Math.round(value * 100);
}

export function isPayoutOverpayment(
  totalMinor: number,
  paidMinor: number,
  nextPaymentMinor: number,
): boolean {
  return paidMinor + nextPaymentMinor > totalMinor;
}

export function getPayoutState(
  totalMinor: number,
  paidMinor: number,
): DentistPayoutState {
  if (paidMinor <= 0) return "OPEN";
  return paidMinor >= totalMinor ? "PAID" : "PARTIALLY_PAID";
}
