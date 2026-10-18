import Link from "next/link";

import {
  createInsuranceProviderAction,
  updateInsuranceProviderAction,
} from "@/features/insurance/actions";

type ProviderFormProps = Readonly<{
  clinicId: string;
  provider?: {
    id: string;
    name: string;
    kind: string;
    phoneNumber: string | null;
    email: string | null;
    website: string | null;
    claimInstructions: string | null;
    notes: string | null;
  };
}>;

const fieldClass =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function ProviderForm({ clinicId, provider }: ProviderFormProps) {
  return (
    <form
      action={
        provider ? updateInsuranceProviderAction : createInsuranceProviderAction
      }
      className="space-y-5"
    >
      <input name="clinicId" type="hidden" value={clinicId} />
      {provider && (
        <input name="providerId" type="hidden" value={provider.id} />
      )}
      <div>
        <label className={labelClass} htmlFor="provider-name">
          Organization name
        </label>
        <input
          className={fieldClass}
          defaultValue={provider?.name}
          id="provider-name"
          maxLength={180}
          name="name"
          required
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="provider-kind">
            Organization type
          </label>
          <select
            className={fieldClass}
            defaultValue={provider?.kind ?? "INSURER"}
            id="provider-kind"
            name="kind"
          >
            <option value="INSURER">Insurer</option>
            <option value="TPA">Third-party administrator (TPA)</option>
            <option value="BOTH">Insurer and TPA</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="provider-phone">
            Contact phone
          </label>
          <input
            className={fieldClass}
            defaultValue={provider?.phoneNumber ?? ""}
            id="provider-phone"
            maxLength={20}
            name="phoneNumber"
            type="tel"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="provider-email">
            Contact email
          </label>
          <input
            className={fieldClass}
            defaultValue={provider?.email ?? ""}
            id="provider-email"
            maxLength={254}
            name="email"
            type="email"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="provider-website">
            Website
          </label>
          <input
            className={fieldClass}
            defaultValue={provider?.website ?? ""}
            id="provider-website"
            maxLength={400}
            name="website"
            type="url"
          />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="provider-instructions">
          Claim instructions
        </label>
        <textarea
          className="min-h-28 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={provider?.claimInstructions ?? ""}
          id="provider-instructions"
          maxLength={5000}
          name="claimInstructions"
          rows={4}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="provider-notes">
          Internal notes
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={provider?.notes ?? ""}
          id="provider-notes"
          maxLength={5000}
          name="notes"
          rows={3}
        />
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
          href={`/clinic/${clinicId}/insurance/providers`}
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          type="submit"
        >
          {provider ? "Save changes" : "Add provider"}
        </button>
      </div>
    </form>
  );
}
