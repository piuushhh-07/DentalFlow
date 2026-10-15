import assert from "node:assert/strict";
import test from "node:test";

import {
  onboardClinicForUser,
  OnboardingAuthenticationRequiredError,
  type ClinicOnboardingRepository,
  type ExistingClinicMembership,
} from "@/features/onboarding/lib/onboarding";
import {
  clinicOnboardingSchema,
  normalizeIndianPhoneNumber,
} from "@/features/onboarding/lib/validation";

const input = clinicOnboardingSchema.parse({
  name: "Bright Dental",
  phoneNumber: "98765 43210",
  timeZone: "Asia/Kolkata",
  contactEmail: "",
  address: "",
});

const clinicMembership: ExistingClinicMembership = {
  clinicId: "20000000-0000-4000-8000-000000000001",
  clinicName: "Bright Dental",
};

function createRepository(
  memberships: ExistingClinicMembership[] = [],
): ClinicOnboardingRepository & { creates: number } {
  let currentMemberships = memberships;
  let clinicId = memberships[0]?.clinicId;
  const repository = {
    creates: 0,
    async listMemberships() {
      return currentMemberships;
    },
    async ensureOwnerClinic(_userId: string, data: typeof input) {
      repository.creates += 1;

      if (currentMemberships.length > 0) {
        return { kind: "existing" as const, memberships: currentMemberships };
      }

      clinicId ??= "20000000-0000-4000-8000-000000000001";
      currentMemberships = [{ clinicId, clinicName: data.name }];
      return { kind: "created" as const, clinicId };
    },
  };

  return repository;
}

test("denies onboarding without an authenticated user", async () => {
  const repository = createRepository();

  await assert.rejects(
    () => onboardClinicForUser(null, input, repository),
    OnboardingAuthenticationRequiredError,
  );
  assert.equal(repository.creates, 0);
});

test("creates a clinic for the authenticated user and redirects to it", async () => {
  const repository = createRepository();
  const result = await onboardClinicForUser(
    "10000000-0000-4000-8000-000000000001",
    input,
    repository,
  );

  assert.deepEqual(result, {
    kind: "created",
    clinicId: clinicMembership.clinicId,
    redirectTo: `/clinic/${clinicMembership.clinicId}`,
  });
  assert.equal(repository.creates, 1);
});

test("retrying onboarding routes to the existing membership without creating another clinic", async () => {
  const repository = createRepository();
  const userId = "10000000-0000-4000-8000-000000000001";

  const firstResult = await onboardClinicForUser(userId, input, repository);
  const retryResult = await onboardClinicForUser(userId, input, repository);

  assert.equal(firstResult.kind, "created");
  assert.deepEqual(retryResult, {
    kind: "existing",
    memberships: [clinicMembership],
    redirectTo: `/clinic/${clinicMembership.clinicId}`,
  });
  assert.equal(repository.creates, 1);
});

test("existing members are redirected to an authorized clinic instead of onboarding", async () => {
  const repository = createRepository([clinicMembership]);
  const result = await onboardClinicForUser(
    "10000000-0000-4000-8000-000000000001",
    input,
    repository,
  );

  assert.equal(result.kind, "existing");
  assert.equal(result.redirectTo, `/clinic/${clinicMembership.clinicId}`);
  assert.equal(repository.creates, 0);
});

test("multiple memberships route to clinic selection", async () => {
  const repository = createRepository([
    clinicMembership,
    {
      clinicId: "20000000-0000-4000-8000-000000000002",
      clinicName: "Second Clinic",
    },
  ]);

  const result = await onboardClinicForUser(
    "10000000-0000-4000-8000-000000000001",
    input,
    repository,
  );

  assert.equal(result.redirectTo, "/clinics");
  assert.equal(repository.creates, 0);
});

test("normalizes Indian mobile numbers and rejects invalid numbers", () => {
  assert.equal(normalizeIndianPhoneNumber("98765 43210"), "+919876543210");
  assert.equal(
    normalizeIndianPhoneNumber("+91 (98765) 43210"),
    "+919876543210",
  );
  assert.equal(normalizeIndianPhoneNumber("09876543210"), "+919876543210");
  assert.equal(normalizeIndianPhoneNumber("12345"), null);
});

test("defaults timezone and accepts optional clinic contact details", () => {
  const parsed = clinicOnboardingSchema.parse({
    name: "Bright Dental",
    phoneNumber: "+919876543210",
    contactEmail: "  ",
    address: "",
  });

  assert.equal(parsed.timeZone, "Asia/Kolkata");
  assert.equal(parsed.contactEmail, null);
  assert.equal(parsed.address, null);
});
