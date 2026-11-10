import { ClinicRole } from "@prisma/client";

export type MembershipMutation =
  | Readonly<{
      kind: "change-role";
      currentRole: ClinicRole;
      nextRole: ClinicRole;
      ownerCount: number;
    }>
  | Readonly<{
      kind: "remove";
      currentRole: ClinicRole;
      ownerCount: number;
    }>;

export type MembershipMutationError = "LAST_OWNER" | "INVALID_OWNER_COUNT";

/**
 * Enforces the clinic-level invariant that every clinic retains at least one
 * OWNER. Call this inside the same serializable transaction as the mutation.
 */
export function validateMembershipMutation(
  mutation: MembershipMutation,
): MembershipMutationError | null {
  if (!Number.isInteger(mutation.ownerCount) || mutation.ownerCount < 0) {
    return "INVALID_OWNER_COUNT";
  }

  const removesOwner =
    mutation.currentRole === ClinicRole.OWNER &&
    (mutation.kind === "remove" || mutation.nextRole === ClinicRole.STAFF);

  if (removesOwner && mutation.ownerCount <= 1) {
    return "LAST_OWNER";
  }

  return null;
}
