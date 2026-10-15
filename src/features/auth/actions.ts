"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

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
  const { data, error } = await supabase.auth.signInWithPassword(result.data);

  if (error || !data.user) {
    redirect("/login?error=credentials");
  }

  await prisma.userProfile.upsert({
    where: { id: data.user.id },
    create: { id: data.user.id },
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
