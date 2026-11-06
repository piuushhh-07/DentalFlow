import Link from "next/link";

import { updatePublicBookingEnabledAction } from "@/features/appointments/actions";

export function PublicBookingSettings({
  clinicId,
  slug,
  enabled,
}: {
  clinicId: string;
  slug: string;
  enabled: boolean;
}) {
  const publicUrl = `/book/${slug}`;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">
          Online booking requests are {enabled ? "on" : "off"}
        </p>
        {enabled && (
          <Link
            className="mt-1 inline-block break-all text-sm text-teal-800 underline"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {publicUrl}
          </Link>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Patients submit a request; clinic staff must approve it before it
          becomes an appointment.
        </p>
      </div>
      <form action={updatePublicBookingEnabledAction}>
        <input name="clinicId" type="hidden" value={clinicId} />
        <input
          name="enabled"
          type="hidden"
          value={enabled ? "false" : "true"}
        />
        <button
          className="h-10 shrink-0 rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50"
          type="submit"
        >
          Turn booking {enabled ? "off" : "on"}
        </button>
      </form>
    </div>
  );
}
