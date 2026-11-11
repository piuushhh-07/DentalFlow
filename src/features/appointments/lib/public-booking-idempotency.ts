import { Prisma } from "@prisma/client";

export const PUBLIC_BOOKING_IDEMPOTENCY_WINDOW_MS = 2 * 60_000;
export const PUBLIC_BOOKING_LOCK_TIMEOUT = "8s";
export const PUBLIC_BOOKING_TRANSACTION_TIMEOUT_MS = 15_000;

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

export type PublicBookingIdempotencyOperations = Readonly<{
  withLock<T>(operation: () => Promise<T>): Promise<T>;
  findRecentRequests(): Promise<readonly ExistingPublicBookingRequest[]>;
  createRequest(): Promise<Readonly<{ id: string }>>;
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

export async function createOrReusePublicBookingRequest(
  clinicId: string,
  input: PublicBookingRequestDetails,
  now: Date,
  operations: PublicBookingIdempotencyOperations,
): Promise<Readonly<{ id: string }>> {
  return operations.withLock(async () => {
    const recentRequests = await operations.findRecentRequests();
    const duplicate = recentRequests.find((request) =>
      isDuplicatePublicBookingRequest(request, clinicId, input, now),
    );
    if (duplicate) return { id: duplicate.id };

    return operations.createRequest();
  });
}

export function getPublicBookingPhoneLockKey(
  clinicId: string,
  phoneNumber: string,
): string {
  return JSON.stringify([clinicId, phoneNumber]);
}

export function getPublicBookingPhoneLockQuery(lockKey: string): Prisma.Sql {
  return Prisma.sql`
    SELECT (pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL)::int AS locked
  `;
}
