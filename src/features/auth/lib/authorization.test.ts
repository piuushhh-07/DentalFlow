import assert from "node:assert/strict";
import test from "node:test";

import { ClinicPermission, ClinicRole } from "@prisma/client";

import {
  authorizeClinicMembership,
  authorizeClinicPermission,
  authorizeClinicRole,
  ClinicAccessDeniedError,
  ClinicPermissionDeniedError,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";

const userId = "10000000-0000-4000-8000-000000000001";
const clinicId = "20000000-0000-4000-8000-000000000001";
const otherClinicId = "20000000-0000-4000-8000-000000000002";

test("authorizes only the matching user and clinic membership", () => {
  const membership = authorizeClinicMembership(userId, clinicId, {
    userId,
    clinicId,
    role: ClinicRole.OWNER,
  });

  assert.deepEqual(membership, {
    userId,
    clinicId,
    role: ClinicRole.OWNER,
  });
});

test("denies a missing membership", () => {
  assert.throws(
    () => authorizeClinicMembership(userId, clinicId, null),
    ClinicAccessDeniedError,
  );
});

test("denies a membership for a different clinic", () => {
  assert.throws(
    () =>
      authorizeClinicMembership(userId, clinicId, {
        userId,
        clinicId: otherClinicId,
        role: ClinicRole.OWNER,
      }),
    ClinicAccessDeniedError,
  );
});

test("denies a membership belonging to a different authenticated user", () => {
  assert.throws(
    () =>
      authorizeClinicMembership(userId, clinicId, {
        userId: "10000000-0000-4000-8000-000000000002",
        clinicId,
        role: ClinicRole.OWNER,
      }),
    ClinicAccessDeniedError,
  );
});

test("uses the database membership role for role authorization", () => {
  const staffMembership = {
    userId,
    clinicId,
    role: ClinicRole.STAFF,
  };
  const verifiedMembership = authorizeClinicMembership(
    userId,
    clinicId,
    staffMembership,
  );

  assert.throws(
    () => authorizeClinicRole(verifiedMembership, [ClinicRole.OWNER]),
    ClinicRoleDeniedError,
  );
  assert.equal(
    authorizeClinicRole(verifiedMembership, [
      ClinicRole.OWNER,
      ClinicRole.STAFF,
    ]).role,
    ClinicRole.STAFF,
  );
});

test("preserves legacy permissions but requires explicit grants for new permissions", () => {
  const staff = authorizeClinicMembership(userId, clinicId, {
    userId,
    clinicId,
    role: ClinicRole.STAFF,
  });
  for (const permission of [
    ClinicPermission.PATIENT_VIEW,
    ClinicPermission.PATIENT_EDIT,
    ClinicPermission.APPOINTMENT_MANAGE,
    ClinicPermission.CLINICAL_RECORDS,
    ClinicPermission.PRESCRIPTIONS,
    ClinicPermission.TREATMENT_PLANS,
    ClinicPermission.FINANCIAL_RECORDS,
    ClinicPermission.INSURANCE,
    ClinicPermission.REPORTS,
  ]) {
    assert.equal(
      authorizeClinicPermission(staff, false, [], permission),
      staff,
    );
  }
  for (const permission of [
    ClinicPermission.INVENTORY,
    ClinicPermission.STAFF_MANAGE,
    ClinicPermission.CLINIC_SETTINGS,
  ]) {
    assert.throws(
      () => authorizeClinicPermission(staff, false, [], permission),
      ClinicPermissionDeniedError,
    );
    assert.equal(
      authorizeClinicPermission(staff, true, [permission], permission),
      staff,
    );
  }
  assert.equal(
    authorizeClinicPermission(
      staff,
      true,
      [ClinicPermission.PATIENT_VIEW],
      ClinicPermission.PATIENT_VIEW,
    ),
    staff,
  );
  assert.throws(
    () =>
      authorizeClinicPermission(
        staff,
        true,
        [ClinicPermission.PATIENT_VIEW],
        ClinicPermission.REPORTS,
      ),
    ClinicPermissionDeniedError,
  );
  const owner = authorizeClinicMembership(userId, clinicId, {
    userId,
    clinicId,
    role: ClinicRole.OWNER,
  });
  assert.equal(
    authorizeClinicPermission(owner, true, [], ClinicPermission.REPORTS),
    owner,
  );
});

test("appointment scheduling permits only verified OWNER and STAFF memberships", () => {
  for (const role of [ClinicRole.OWNER, ClinicRole.STAFF]) {
    const membership = authorizeClinicMembership(userId, clinicId, {
      userId,
      clinicId,
      role,
    });

    assert.equal(
      authorizeClinicRole(membership, [ClinicRole.OWNER, ClinicRole.STAFF])
        .role,
      role,
    );
  }

  assert.throws(
    () => authorizeClinicMembership(userId, clinicId, null),
    ClinicAccessDeniedError,
  );
});

test("allows template editing only for an owner membership", () => {
  const owner = authorizeClinicMembership(userId, clinicId, {
    userId,
    clinicId,
    role: ClinicRole.OWNER,
  });
  assert.equal(
    authorizeClinicRole(owner, [ClinicRole.OWNER]).role,
    ClinicRole.OWNER,
  );

  const staff = authorizeClinicMembership(userId, clinicId, {
    userId,
    clinicId,
    role: ClinicRole.STAFF,
  });
  assert.throws(
    () => authorizeClinicRole(staff, [ClinicRole.OWNER]),
    ClinicRoleDeniedError,
  );

  assert.throws(
    () =>
      authorizeClinicMembership(userId, otherClinicId, {
        userId,
        clinicId,
        role: ClinicRole.OWNER,
      }),
    ClinicAccessDeniedError,
  );
});

test("rejects malformed memberships and invalid role checks without crashing", () => {
  assert.throws(
    () =>
      authorizeClinicMembership(
        userId,
        clinicId,
        // @ts-expect-error intentional malformed record shape for validation
        { userId, clinicId, role: "NOT_A_ROLE" },
      ),
    ClinicAccessDeniedError,
  );

  assert.throws(
    () =>
      authorizeClinicRole(
        // @ts-expect-error intentional malformed membership
        { userId, clinicId, role: "NOT_A_ROLE" },
        [ClinicRole.OWNER],
      ),
    ClinicRoleDeniedError,
  );

  assert.throws(
    () =>
      authorizeClinicRole(
        { userId, clinicId, role: ClinicRole.OWNER },
        // @ts-expect-error intentional malformed allowed-role input
        ["NOT_A_ROLE"],
      ),
    ClinicRoleDeniedError,
  );
});
