"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";

import {
  classifySignInResult,
  getSafeAuthErrorMetadata,
  persistSignInProfile,
} from "@/features/auth/lib/auth-login";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

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
        create: { id: user.id },
        update: {},
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
