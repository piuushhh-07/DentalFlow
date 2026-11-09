import assert from "node:assert/strict";
import test from "node:test";

import { ClinicRole } from "@prisma/client";

import { validateMembershipMutation } from "@/features/team/lib/team-management";

test("allows removing a STAFF membership when the clinic has one owner", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "remove",
      currentRole: ClinicRole.STAFF,
      ownerCount: 1,
    }),
    null,
  );
});

test("allows removing an OWNER when another owner remains", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "remove",
      currentRole: ClinicRole.OWNER,
      ownerCount: 2,
    }),
    null,
  );
});

test("prevents removing the last OWNER", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "remove",
      currentRole: ClinicRole.OWNER,
      ownerCount: 1,
    }),
    "LAST_OWNER",
  );
});

test("prevents demoting the last OWNER to STAFF", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "change-role",
      currentRole: ClinicRole.OWNER,
      nextRole: ClinicRole.STAFF,
      ownerCount: 1,
    }),
    "LAST_OWNER",
  );
});

test("allows demoting an OWNER when another owner remains", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "change-role",
      currentRole: ClinicRole.OWNER,
      nextRole: ClinicRole.STAFF,
      ownerCount: 2,
    }),
    null,
  );
});

test("does not block promoting STAFF to OWNER", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "change-role",
      currentRole: ClinicRole.STAFF,
      nextRole: ClinicRole.OWNER,
      ownerCount: 1,
    }),
    null,
  );
});

test("rejects an invalid owner count", () => {
  assert.equal(
    validateMembershipMutation({
      kind: "remove",
      currentRole: ClinicRole.OWNER,
      ownerCount: -1,
    }),
    "INVALID_OWNER_COUNT",
  );
});
