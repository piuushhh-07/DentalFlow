import { notFound } from "next/navigation";
import { z } from "zod";

import { PublicBookingRequestForm } from "@/features/appointments/components/public-booking-request-form";
import { getPublicBookingClinic } from "@/features/appointments/lib/appointment-repository";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = z.string().trim().min(1).max(180).safeParse(params.slug);
  if (!slug.success) notFound();

  const clinic = await getPublicBookingClinic(slug.data);
  if (!clinic) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 rounded-2xl bg-teal-900 p-6 text-white shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-100">
            Appointment request
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {clinic.name}
          </h1>
          {clinic.address && (
            <p className="mt-2 text-sm text-teal-50">{clinic.address}</p>
          )}
          {clinic.phoneNumber && (
            <p className="mt-1 text-sm text-teal-50">
              Clinic phone: {clinic.phoneNumber}
            </p>
          )}
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">
            Request a time
          </h2>
          <p className="mb-6 text-sm text-slate-600">
            Select your preferred slot. The clinic will review and contact you
            to confirm.
          </p>
          <PublicBookingRequestForm
            chairs={clinic.treatmentChairs}
            dentists={clinic.dentists}
            slug={clinic.publicBookingSlug}
          />
        </section>
        <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-5 text-slate-500">
          Please do not include sensitive medical information in the optional
          note. Your contact details are shared with this clinic only to respond
          to your request.
        </p>
      </div>
    </main>
  );
}
