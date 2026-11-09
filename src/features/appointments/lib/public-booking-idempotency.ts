export const PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS = 2 * 60_000;

export type PublicBookingRequestDetails = Readonly<{
  patientName: string;
  phoneNumber: string;
  requestedAt: Date;
  dentistId: string;
  chairId: string;
  notes: string | null;
}>;

export type ExistingPublicBookingRequest = Omit<
  PublicBookingRequestDetails,
  "dentistId" | "chairId"
> &
  Readonly<{
    id: string;
    clinicId: string;
    createdAt: Date;
    dentistId: string | null;
    chairId: string | null;
  }>;

export function isDuplicatePublicBookingRequest(
  existing: ExistingPublicBookingRequest,
  clinicId: string,
  input: PublicBookingRequestDetails,
  now: Date,
): boolean {
  return (
    existing.clinicId === clinicId &&
    existing.createdAt.getTime() >=
      now.getTime() - PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS &&
    existing.createdAt.getTime() <= now.getTime() &&
    existing.patientName === input.patientName &&
    existing.phoneNumber === input.phoneNumber &&
    existing.requestedAt.getTime() === input.requestedAt.getTime() &&
    existing.dentistId === input.dentistId &&
    existing.chairId === input.chairId &&
    existing.notes === input.notes
  );
}

export function getPublicBookingPhoneLockKey(
  clinicId: string,
  phoneNumber: string,
): string {
  return JSON.stringify([clinicId, phoneNumber]);
}
