import { HeartHandshake } from "lucide-react";

import { SignInForm } from "@/features/auth/components/sign-in-form";

type LoginPageProps = Readonly<{
  searchParams: {
    error?: string;
  };
}>;

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <HeartHandshake aria-hidden="true" className="size-6" />
          </span>
          <p className="text-lg font-bold tracking-tight text-slate-900">
            DentalFlow
          </p>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to continue to your clinic workspace.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <SignInForm error={searchParams.error} />
        </div>
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Clinic access is granted only after your clinic membership is
          verified.
        </p>
      </div>
    </main>
  );
}
