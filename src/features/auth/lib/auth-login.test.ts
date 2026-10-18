import assert from "node:assert/strict";
import test from "node:test";

import { AuthApiError, type User } from "@supabase/supabase-js";

import {
  classifySignInResult,
  getSafeAuthErrorMetadata,
} from "@/features/auth/lib/auth-login";

const authenticatedUser: User = {
  id: "10000000-0000-4000-8000-000000000001",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
};

test("classifies rejected credentials distinctly", () => {
  const error = new AuthApiError(
    "Invalid login credentials",
    400,
    "invalid_credentials",
  );

  assert.equal(classifySignInResult(null, error), "credentials");
});

test("classifies confirmed-user requirement separately", () => {
  const error = new AuthApiError(
    "Email not confirmed",
    400,
    "email_not_confirmed",
  );

  assert.equal(classifySignInResult(null, error), "unconfirmed");
});

test("accepts only a successful result containing an authenticated user", () => {
  assert.equal(classifySignInResult(authenticatedUser, null), "success");
  assert.equal(classifySignInResult(null, null), "unavailable");
});

test("keeps unexpected auth and network failures out of the credential category", () => {
  const authError = new AuthApiError(
    "Authentication service unavailable",
    503,
    "unexpected_failure",
  );
  const networkError = new TypeError("Network request failed");

  assert.equal(classifySignInResult(null, authError), "unavailable");
  assert.equal(classifySignInResult(null, networkError), "unavailable");
});

test("exposes only safe auth error metadata for server diagnostics", () => {
  const error = new AuthApiError(
    "Sensitive provider response should not be logged",
    401,
    "invalid_credentials",
  );

  assert.deepEqual(getSafeAuthErrorMetadata(error), {
    name: "AuthApiError",
    code: "invalid_credentials",
    status: 401,
  });
  assert.deepEqual(getSafeAuthErrorMetadata(new TypeError("secret text")), {
    name: "TypeError",
    code: "none",
    status: "none",
  });
});
