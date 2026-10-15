import { HeartHandshake } from "lucide-react";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/lib/server-auth";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { clinicLandingPath } from "@/features/onboarding/lib/onboarding";
import { getUserClinicMemberships } from "@/features/onboarding/lib/user-clinics";

export default async function OnboardingPage() {
  const user = await getAuthenticatedUser();
  const memberships = await getUserClinicMemberships(user.id);

  if (memberships.length > 0) {
    redirect(clinicLandingPath(memberships));
  }

  return (
    <main className="min-h-svh bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <HeartHandshake aria-hidden="true" className="size-6" />
          </span>
          <p className="text-lg font-bold tracking-tight text-slate-900">
            DentalFlow
          </p>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            First, your clinic
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Set up your clinic workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Add the clinic details your team and patients will recognize. You
            will be assigned the owner role for this clinic.
          </p>
          <div className="mt-7">
            <OnboardingForm />
          </div>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Your details are stored securely and are only available to authorized
          clinic members.
        </p>
      </div>
    </main>
  );
}
