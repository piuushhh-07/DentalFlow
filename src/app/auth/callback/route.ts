import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { activatePendingClinicInvitations } from "@/features/auth/lib/invitation-repository";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const otpTypeSchema = z.enum([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = otpTypeSchema.safeParse(
    request.nextUrl.searchParams.get("type"),
  );
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Email verification callback failed.", {
        status: error.status,
        code: error.code,
      });
      return NextResponse.redirect(new URL("/login?error=verification", request.url));
    }
  } else if (tokenHash && otpType.success) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType.data,
    });
    if (error) {
      console.error("Email verification callback failed.", {
        status: error.status,
        code: error.code,
      });
      return NextResponse.redirect(new URL("/login?error=verification", request.url));
    }
  } else {
    return NextResponse.redirect(new URL("/login?error=verification", request.url));
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) {
    console.error("Verified invitation did not produce a confirmed user.", {
      status: error?.status,
      code: error?.code,
    });
    return NextResponse.redirect(new URL("/login?error=verification", request.url));
  }

  const normalizedEmail = data.user.email.trim().toLowerCase();
  try {
    await prisma.userProfile.upsert({
      where: { id: data.user.id },
      create: {
        id: data.user.id,
        email: data.user.email,
        normalizedEmail,
      },
      update: {
        email: data.user.email,
        normalizedEmail,
      },
    });
    await activatePendingClinicInvitations(data.user.id, normalizedEmail);
  } catch (error) {
    console.error("Verified clinic invitation activation failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.redirect(new URL("/login?error=database", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
