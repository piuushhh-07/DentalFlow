import type { ClinicOnboardingInput } from "@/features/onboarding/lib/validation";

export type ExistingClinicMembership = Readonly<{
  clinicId: string;
  clinicName: string;
}>;

export type ClinicOnboardingResult =
  | Readonly<{ kind: "created"; clinicId: string; redirectTo: string }>
  | Readonly<{
      kind: "existing";
      memberships: ExistingClinicMembership[];
      redirectTo: string;
    }>;

export interface ClinicOnboardingRepository {
  listMemberships(userId: string): Promise<ExistingClinicMembership[]>;
  ensureOwnerClinic(
    userId: string,
    input: ClinicOnboardingInput,
  ): Promise<
    | Readonly<{ kind: "created"; clinicId: string }>
    | Readonly<{ kind: "existing"; memberships: ExistingClinicMembership[] }>
  >;
}

export class OnboardingAuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required to create a clinic.");
    this.name = "OnboardingAuthenticationRequiredError";
  }
}

export class OnboardingMembershipConflictError extends Error {
  constructor() {
    super(
      "The onboarding clinic exists, but this user has no active membership.",
    );
    this.name = "OnboardingMembershipConflictError";
  }
}

export function clinicLandingPath(
  memberships: readonly ExistingClinicMembership[],
): string {
  if (memberships.length === 0) {
    return "/onboarding";
  }

  if (memberships.length === 1) {
    return `/clinic/${memberships[0].clinicId}`;
  }

  return "/clinics";
}

export async function onboardClinicForUser(
  userId: string | null,
  input: ClinicOnboardingInput,
  repository: ClinicOnboardingRepository,
): Promise<ClinicOnboardingResult> {
  if (!userId) {
    throw new OnboardingAuthenticationRequiredError();
  }

  const existingMemberships = await repository.listMemberships(userId);

  if (existingMemberships.length > 0) {
    return {
      kind: "existing",
      memberships: existingMemberships,
      redirectTo: clinicLandingPath(existingMemberships),
    };
  }

  const result = await repository.ensureOwnerClinic(userId, input);

  if (result.kind === "existing") {
    return {
      kind: "existing",
      memberships: result.memberships,
      redirectTo: clinicLandingPath(result.memberships),
    };
  }

  return {
    kind: "created",
    clinicId: result.clinicId,
    redirectTo: `/clinic/${result.clinicId}`,
  };
}
