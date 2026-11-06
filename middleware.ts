import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isExpectedUnauthenticatedAuthError } from "@/features/auth/lib/auth-session";
import { isLocalDemoEnabled } from "@/features/demo/lib/demo-mode";
import { getSupabasePublicEnvironment } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const isDemoRoute =
    request.nextUrl.pathname === "/demo" ||
    request.nextUrl.pathname.startsWith("/demo/");
  const isPublicBookingRoute =
    request.nextUrl.pathname === "/book" ||
    request.nextUrl.pathname.startsWith("/book/");
  const isPatientPortalRoute =
    request.nextUrl.pathname === "/portal" ||
    request.nextUrl.pathname.startsWith("/portal/");
  const isAuthCallbackRoute = request.nextUrl.pathname === "/auth/callback";
  const isWhatsAppReminderJob =
    request.nextUrl.pathname === "/api/cron/whatsapp-reminders";
  if (isDemoRoute) {
    if (
      isLocalDemoEnabled(
        process.env.NODE_ENV,
        process.env.NEXT_PUBLIC_DENTALFLOW_DEMO_MODE,
      )
    ) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 404 });
  }

  const environment = getSupabasePublicEnvironment();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let user = null;
  let error: unknown = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (authError) {
    error = authError;
  }

  if (isExpectedUnauthenticatedAuthError(error)) {
    user = null;
    error = null;
  }

  if (
    isPublicBookingRoute ||
    isPatientPortalRoute ||
    isAuthCallbackRoute ||
    isWhatsAppReminderJob
  ) {
    return response;
  }

  const isLoginPage = request.nextUrl.pathname === "/login";

  if (error) {
    if (isLoginPage) {
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "verification");
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (!user && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (user && isLoginPage) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    const redirectResponse = NextResponse.redirect(homeUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
