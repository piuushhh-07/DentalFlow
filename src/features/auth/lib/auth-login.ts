import { AuthApiError, AuthError, type User } from "@supabase/supabase-js";

export type SignInFailureCode = "credentials" | "unconfirmed" | "unavailable";

export type SignInProfilePersistenceResult =
  | Readonly<{ status: "saved" }>
  | Readonly<{
      status: "failed";
      persistenceError: unknown;
      cleanupError: unknown | null;
    }>;

export async function persistSignInProfile(
  persist: () => Promise<unknown>,
  clearSession: () => Promise<unknown>,
): Promise<SignInProfilePersistenceResult> {
  try {
    await persist();
    return { status: "saved" };
  } catch (persistenceError) {
    try {
      const cleanupError = await clearSession();
      return { status: "failed", persistenceError, cleanupError };
    } catch (cleanupError) {
      return { status: "failed", persistenceError, cleanupError };
    }
  }
}

export function classifySignInResult(
  user: User | null,
  error: unknown,
): "success" | SignInFailureCode {
  if (!error && user) {
    return "success";
  }

  if (error instanceof AuthApiError && error.code === "invalid_credentials") {
    return "credentials";
  }

  if (error instanceof AuthApiError && error.code === "email_not_confirmed") {
    return "unconfirmed";
  }

  return "unavailable";
}

export function getSafeAuthErrorMetadata(error: unknown) {
  if (error instanceof AuthError) {
    return {
      name: error.name,
      code: error.code ?? "none",
      status: error.status ?? "none",
    };
  }

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: "none",
    status: "none",
  };
}
