"use client";

import { archiveInsuranceProviderAction } from "@/features/insurance/actions";

export function ArchiveProviderForm({
  clinicId,
  providerId,
}: Readonly<{ clinicId: string; providerId: string }>) {
  return (
    <form
      action={archiveInsuranceProviderAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Archive this provider? Existing policies will remain.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="providerId" type="hidden" value={providerId} />
      <button
        className="inline-flex min-h-9 items-center rounded-md border border-amber-200 px-3 text-sm font-medium text-amber-800 hover:bg-amber-50"
        type="submit"
      >
        Archive
      </button>
    </form>
  );
}
