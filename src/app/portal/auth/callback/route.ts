import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/portal?error=verification", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Patient portal callback verification failed.", {
      status: error.status,
      code: error.code,
    });
    return NextResponse.redirect(new URL("/portal?error=verification", request.url));
  }

  return NextResponse.redirect(new URL("/portal", request.url));
}
