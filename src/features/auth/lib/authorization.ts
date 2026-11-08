import { ClinicPermission, ClinicRole } from "@prisma/client";

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

export class ClinicPermissionDeniedError extends ClinicAccessDeniedError {
  constructor() {
    super();
    this.message =
      "The authenticated user's clinic permissions do not allow this action.";
    this.name = "ClinicPermissionDeniedError";
  }
}

const legacyStaffPermissions = new Set<ClinicPermission>([
  ClinicPermission.PATIENT_VIEW,
  ClinicPermission.PATIENT_EDIT,
  ClinicPermission.APPOINTMENT_MANAGE,
  ClinicPermission.CLINICAL_RECORDS,
  ClinicPermission.PRESCRIPTIONS,
  ClinicPermission.TREATMENT_PLANS,
  ClinicPermission.FINANCIAL_RECORDS,
  ClinicPermission.INSURANCE,
  ClinicPermission.REPORTS,
]);

export function hasLegacyStaffPermission(permission: ClinicPermission): boolean {
  return legacyStaffPermissions.has(permission);
}

export function authorizeClinicPermission(
  membership: VerifiedClinicMembership | null,
  permissionsConfigured: boolean,
  grantedPermissions: readonly ClinicPermission[],
  requestedPermission: ClinicPermission,
): VerifiedClinicMembership {
  if (!membership) throw new ClinicAccessDeniedError();
  if (
    membership.role === ClinicRole.OWNER ||
    (!permissionsConfigured && hasLegacyStaffPermission(requestedPermission)) ||
    grantedPermissions.includes(requestedPermission)
  ) {
    return membership;
  }
  throw new ClinicPermissionDeniedError();
}

function isValidClinicRole(value: unknown): value is ClinicRole {
  return (
    typeof value === "string" &&
    Object.values(ClinicRole).includes(value as ClinicRole)
  );
}

export function authorizeClinicMembership(
  authenticatedUserId: string,
  requestedClinicId: string,
  membership: ClinicMembershipRecord | null,
): VerifiedClinicMembership {
  const hasValidAuthIdentity =
    typeof authenticatedUserId === "string" && authenticatedUserId.length > 0;
  const hasValidClinicSelection =
    typeof requestedClinicId === "string" && requestedClinicId.length > 0;

  if (
    !hasValidAuthIdentity ||
    !hasValidClinicSelection ||
    !membership ||
    typeof membership.userId !== "string" ||
    typeof membership.clinicId !== "string" ||
    membership.userId !== authenticatedUserId ||
    membership.clinicId !== requestedClinicId ||
    !isValidClinicRole(membership.role)
  ) {
    throw new ClinicAccessDeniedError();
  }

  return {
    userId: membership.userId,
    clinicId: membership.clinicId,
    role: membership.role,
  };
}

export function authorizeClinicRole(
  membership: VerifiedClinicMembership | null,
  allowedRoles: readonly ClinicRole[] | null | undefined,
): VerifiedClinicMembership {
  if (
    !membership ||
    !Array.isArray(allowedRoles) ||
    !allowedRoles.every((role) => isValidClinicRole(role)) ||
    !allowedRoles.includes(membership.role)
  ) {
    throw new ClinicRoleDeniedError();
  }

  return membership;
}
