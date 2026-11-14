import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isExpectedUnauthenticatedAuthError } from "@/features/auth/lib/auth-session";
import { isLocalDemoEnabled } from "@/features/demo/lib/demo-mode";
import { getSupabasePublicEnvironment } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isDemoRoute = pathname === "/demo" || pathname.startsWith("/demo/");
  const isPublicBookingRoute =
    pathname === "/book" || pathname.startsWith("/book/");
  const isPatientPortalRoute =
    pathname === "/portal" || pathname.startsWith("/portal/");
  const isAuthCallbackRoute = pathname === "/auth/callback";
  const isWhatsAppReminderJob = pathname === "/api/cron/whatsapp-reminders";
  const isHealthCheck = pathname === "/api/health";

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

  // These routes implement their own access checks (or are intentionally
  // public), so avoid creating a Supabase client for them in middleware.
  if (
    isPublicBookingRoute ||
    isPatientPortalRoute ||
    isAuthCallbackRoute ||
    isWhatsAppReminderJob ||
    isHealthCheck
  ) {
    return NextResponse.next();
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
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // Preserve Supabase cache-control headers during token refresh so
          // authenticated responses cannot be cached and shared across users.
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    },
  );

  let hasVerifiedSession = false;
  let error: unknown = null;

  try {
    // Verify the JWT for middleware redirect decisions. Protected pages,
    // route handlers, and server actions still call getUser() and enforce
    // clinic membership/role checks before accessing clinic data.
    const result = await supabase.auth.getClaims();
    hasVerifiedSession = Boolean(result.data?.claims);
    error = result.error;
  } catch (authError) {
    error = authError;
  }

  if (isExpectedUnauthenticatedAuthError(error)) {
    hasVerifiedSession = false;
    error = null;
  }

  const isLoginPage = pathname === "/login";

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

  if (!hasVerifiedSession && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (hasVerifiedSession && isLoginPage) {
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
