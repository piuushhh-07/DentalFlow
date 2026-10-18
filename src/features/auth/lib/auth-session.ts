import {
  AuthApiError,
  isAuthSessionMissingError,
  type User,
} from "@supabase/supabase-js";

const unauthenticatedSessionCodes = new Set([
  "bad_jwt",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
]);

export function isExpectedUnauthenticatedAuthError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) {
    return true;
  }

  return (
    error instanceof AuthApiError &&
    unauthenticatedSessionCodes.has(error.code ?? "")
  );
}

export function resolveAuthenticatedUser(
  user: User | null,
  error: unknown,
): User | null {
  if (error) {
    if (isExpectedUnauthenticatedAuthError(error)) {
      return null;
    }

    throw new Error("Unable to verify the Supabase session.", {
      cause: error,
    });
  }

  return user;
}
