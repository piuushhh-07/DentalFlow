"use server";

import {
  ClinicInvitationStatus,
  ClinicRole,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";

import {
  classifySignInResult,
  getSafeAuthErrorMetadata,
  persistSignInProfile,
} from "@/features/auth/lib/auth-login";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/features/auth/lib/supabase-admin";
import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { revalidatePath } from "next/cache";
import {
  activatePendingClinicInvitations,
} from "@/features/auth/lib/invitation-repository";

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

function logUserProfilePersistenceFailure(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Sign-in profile persistence failed", { code: error.code });
    return;
  }

  console.error("Sign-in profile persistence failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function signIn(formData: FormData) {
  const result = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    redirect("/login?error=invalid");
  }

  const supabase = await createSupabaseServerActionClient();
  let authResult;

  try {
    authResult = await supabase.auth.signInWithPassword(result.data);
  } catch (error) {
    const failure = classifySignInResult(null, error);
    console.error(
      "Supabase sign-in request failed",
      getSafeAuthErrorMetadata(error),
    );
    redirect(`/login?error=${failure}`);
  }

  const signInOutcome = classifySignInResult(
    authResult.data.user,
    authResult.error,
  );
  if (signInOutcome !== "success" || !authResult.data.user) {
    console.warn(
      "Supabase sign-in rejected",
      getSafeAuthErrorMetadata(authResult.error),
    );

    if (signInOutcome === "unavailable") {
      redirect("/login?error=unavailable");
    }

    redirect(
      `/login?error=${signInOutcome === "unconfirmed" ? "unconfirmed" : "credentials"}`,
    );
  }

  const user = authResult.data.user;
  const profileResult = await persistSignInProfile(
    async () =>
      prisma.userProfile.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email ?? null,
          normalizedEmail: user.email?.toLowerCase() ?? null,
        },
        update: {
          email: user.email ?? null,
          normalizedEmail: user.email?.toLowerCase() ?? null,
        },
      }),
    async () => (await supabase.auth.signOut()).error,
  );
  if (profileResult.status === "failed") {
    logUserProfilePersistenceFailure(profileResult.persistenceError);
    if (profileResult.cleanupError) {
      console.error("Sign-in session cleanup failed", {
        ...getSafeAuthErrorMetadata(profileResult.cleanupError),
      });
      throw new Error(
        "Sign-in could not complete because clinic profile storage failed and the Supabase session could not be cleared.",
      );
    }
    redirect("/login?error=database");
  }

  const normalizedEmail = user.email?.trim().toLowerCase();
  if (normalizedEmail) {
    try {
      await activatePendingClinicInvitations(user.id, normalizedEmail);
    } catch (error) {
      logUserProfilePersistenceFailure(error);
      throw new Error(
        "Your sign-in succeeded, but clinic invitation access could not be activated. Contact the clinic owner.",
        { cause: error },
      );
    }
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerActionClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error("Unable to end the Supabase session.", { cause: error });
  }

  redirect("/login");
}

export type ClinicTeamActionState = Readonly<{
  error?: string;
  success?: string;
}>;

export async function inviteClinicStaffAction(
  _previousState: ClinicTeamActionState,
  formData: FormData,
): Promise<ClinicTeamActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const email = z
    .string()
    .trim()
    .email()
    .max(254)
    .safeParse(formData.get("email"));
  if (!clinicId.success || !email.success) {
    return { error: "Enter a valid staff email address." };
  }
  const owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  const normalizedEmail = email.data.toLowerCase();
  const existingMembership = await prisma.clinicMembership.findFirst({
    where: {
      clinicId: owner.clinicId,
      user: { normalizedEmail },
    },
    select: { id: true },
  });
  if (existingMembership) {
    return { error: "This person is already a member of the clinic." };
  }
  await prisma.clinicInvitation.updateMany({
    where: {
      clinicId: owner.clinicId,
      normalizedEmail,
      status: ClinicInvitationStatus.PENDING,
      expiresAt: { lte: new Date() },
    },
    data: { status: ClinicInvitationStatus.REVOKED },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error("Staff invitation requires NEXT_PUBLIC_SITE_URL.");
    return { error: "Staff invitations are not configured. Contact support." };
  }
  let redirectTo: string;
  try {
    redirectTo = new URL("/auth/callback", siteUrl).toString();
  } catch (error) {
    console.error("Staff invitation site URL is invalid.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Staff invitations are not configured. Contact support." };
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  let invitationId: string;
  try {
    const invitation = await prisma.clinicInvitation.create({
      data: {
        clinicId: owner.clinicId,
        email: email.data,
        normalizedEmail,
        role: ClinicRole.STAFF,
        invitedByUserId: owner.userId,
        expiresAt,
      },
      select: { id: true },
    });
    invitationId = invitation.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "A pending invitation already exists for this email." };
    }
    logUserProfilePersistenceFailure(error);
    return { error: "We couldn't create the invitation. Please try again." };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.auth.admin.inviteUserByEmail(
      email.data,
      { redirectTo },
    );
    if (error) {
      await prisma.clinicInvitation.updateMany({
        where: { id: invitationId, status: ClinicInvitationStatus.PENDING },
        data: { status: ClinicInvitationStatus.REVOKED },
      });
      console.error("Supabase staff invitation delivery failed.", {
        status: error.status,
        code: error.code,
      });
      return {
        error: "The invitation email could not be sent. Check the email and try again.",
      };
    }
  } catch (error) {
    await prisma.clinicInvitation.updateMany({
      where: { id: invitationId, status: ClinicInvitationStatus.PENDING },
      data: { status: ClinicInvitationStatus.REVOKED },
    });
    console.error("Staff invitation setup failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Staff invitations are not configured. Contact support." };
  }

  revalidatePath(`/clinic/${owner.clinicId}/settings/staff`);
  return {
    success:
      "Invitation sent. Staff access is activated after the invitee signs in with this email.",
  };
}

export async function removeClinicStaffAction(
  _previousState: ClinicTeamActionState,
  formData: FormData,
): Promise<ClinicTeamActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const userId = z.string().uuid().safeParse(formData.get("userId"));
  if (!clinicId.success || !userId.success) {
    return { error: "Choose a valid staff member." };
  }
  const owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  if (userId.data === owner.userId) {
    return { error: "You cannot remove your own owner access." };
  }
  // Preserve the membership revocation audit trail.
  const revoked = await prisma.clinicMembership.updateMany({
    where: {
      clinicId: owner.clinicId,
      userId: userId.data,
      role: ClinicRole.STAFF,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    return { error: "This staff membership is no longer available." };
  }
  revalidatePath(`/clinic/${owner.clinicId}/settings/staff`);
  return { success: "Staff access removed." };
}

export async function revokeClinicInvitationAction(
  _previousState: ClinicTeamActionState,
  formData: FormData,
): Promise<ClinicTeamActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const invitationId = z
    .string()
    .uuid()
    .safeParse(formData.get("invitationId"));
  if (!clinicId.success || !invitationId.success) {
    return { error: "Choose a valid pending invitation." };
  }
  const owner = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  const revoked = await prisma.clinicInvitation.updateMany({
    where: {
      id: invitationId.data,
      clinicId: owner.clinicId,
      status: ClinicInvitationStatus.PENDING,
    },
    data: { status: ClinicInvitationStatus.REVOKED },
  });
  if (revoked.count === 0) {
    return { error: "This invitation is no longer pending." };
  }
  revalidatePath(`/clinic/${owner.clinicId}/settings/staff`);
  return { success: "Invitation revoked. It will not grant clinic access." };
}
