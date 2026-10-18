"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

import {
  classifySignInResult,
  getSafeAuthErrorMetadata,
} from "@/features/auth/lib/auth-login";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

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
  await prisma.userProfile.upsert({
    where: { id: user.id },
    create: { id: user.id },
    update: {},
  });

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
