import { signIn } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

type SignInFormProps = Readonly<{
  error?: string;
}>;

export function SignInForm({ error }: SignInFormProps) {
  const errorMessage =
    error === "credentials"
      ? "We could not sign you in with those details."
      : error === "unconfirmed"
        ? "Confirm your email address in Supabase before signing in."
        : error === "invalid"
          ? "Enter a valid email address and password."
          : error === "verification"
            ? "We could not verify your session. Please sign in again."
            : error === "unavailable"
              ? "Sign-in is temporarily unavailable. Please try again."
              : error === "database"
                ? "We couldn't complete sign-in because clinic profile storage is unavailable. Please try again later."
                : null;

  return (
    <form action={signIn} className="space-y-5">
      {errorMessage && (
        <p
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email address
        </label>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
          id="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium text-slate-700"
          htmlFor="password"
        >
          Password
        </label>
        <input
          autoComplete="current-password"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
          id="password"
          maxLength={256}
          name="password"
          required
          type="password"
        />
      </div>
      <Button className="w-full" type="submit">
        Sign in
      </Button>
    </form>
  );
}
