import { InstrumentPouchStatus, SterilisationCycleResult } from "@prisma/client";

export function canMarkCycleSuccessful(input: {
  chemicalIndicatorPass: boolean;
  biologicalIndicatorPass: boolean;
}): boolean {
  return input.chemicalIndicatorPass && input.biologicalIndicatorPass;
}

export function canCreatePouch(
  result: SterilisationCycleResult,
  expiresAt: Date,
  today = new Date(),
): boolean {
  return result === SterilisationCycleResult.PASS &&
    expiresAt.getTime() >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

export function canUsePouch(
  status: InstrumentPouchStatus,
  expiresAt: Date,
  now = new Date(),
): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate());
  return status === InstrumentPouchStatus.STERILE && expiry >= today;
}
