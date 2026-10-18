import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthApiError,
  AuthSessionMissingError,
  type User,
} from "@supabase/supabase-js";

import {
  isExpectedUnauthenticatedAuthError,
  resolveAuthenticatedUser,
} from "@/features/auth/lib/auth-session";

const authenticatedUser: User = {
  id: "10000000-0000-4000-8000-000000000001",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
};

test("treats a missing Supabase session as unauthenticated", () => {
  assert.equal(
    resolveAuthenticatedUser(null, new AuthSessionMissingError()),
    null,
  );
  assert.equal(resolveAuthenticatedUser(null, null), null);
});

test("treats expired and invalidated sessions as unauthenticated", () => {
  for (const code of [
    "bad_jwt",
    "refresh_token_already_used",
    "refresh_token_not_found",
    "session_expired",
    "session_not_found",
  ]) {
    const error = new AuthApiError("Session is no longer valid.", 401, code);

    assert.equal(isExpectedUnauthenticatedAuthError(error), true);
    assert.equal(resolveAuthenticatedUser(null, error), null);
  }
});

test("returns the Supabase-verified authenticated user", () => {
  assert.equal(
    resolveAuthenticatedUser(authenticatedUser, null),
    authenticatedUser,
  );
});

test("does not treat unexpected authentication and network errors as unauthenticated success", () => {
  const serviceError = new AuthApiError(
    "Authentication service unavailable.",
    503,
    "unexpected_failure",
  );
  const networkError = new TypeError("Network request failed.");

  for (const error of [serviceError, networkError]) {
    assert.equal(isExpectedUnauthenticatedAuthError(error), false);
    assert.throws(
      () => resolveAuthenticatedUser(null, error),
      (thrown: unknown) =>
        thrown instanceof Error &&
        thrown.message === "Unable to verify the Supabase session." &&
        thrown.cause === error,
    );
  }
});
