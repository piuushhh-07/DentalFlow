import { ClinicRole } from "@prisma/client";

export type ClinicMembershipRecord = Readonly<{
  clinicId: string;
  userId: string;
  role: ClinicRole;
}>;

export type VerifiedClinicMembership = Readonly<{
  clinicId: string;
  userId: string;
  role: ClinicRole;
}>;

export class ClinicAccessDeniedError extends Error {
  constructor() {
    super("The authenticated user is not a member of the requested clinic.");
    this.name = "ClinicAccessDeniedError";
  }
}

export class ClinicRoleDeniedError extends Error {
  constructor() {
    super("The authenticated user's clinic role does not allow this action.");
    this.name = "ClinicRoleDeniedError";
  }
}

export function authorizeClinicMembership(
  authenticatedUserId: string,
  requestedClinicId: string,
  membership: ClinicMembershipRecord | null,
): VerifiedClinicMembership {
  if (
    !membership ||
    membership.userId !== authenticatedUserId ||
    membership.clinicId !== requestedClinicId
  ) {
    throw new ClinicAccessDeniedError();
  }

  if (!Object.values(ClinicRole).includes(membership.role)) {
    throw new ClinicAccessDeniedError();
  }

  return {
    userId: membership.userId,
    clinicId: membership.clinicId,
    role: membership.role,
  };
}

export function authorizeClinicRole(
  membership: VerifiedClinicMembership,
  allowedRoles: readonly ClinicRole[],
): VerifiedClinicMembership {
  if (!allowedRoles.includes(membership.role)) {
    throw new ClinicRoleDeniedError();
  }

  return membership;
}
