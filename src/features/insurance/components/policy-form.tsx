import Link from "next/link";

import { createInsurancePolicyAction } from "@/features/insurance/actions";

type PolicyFormProps = Readonly<{
  clinicId: string;
  patientId: string;
  patientName: string;
  providers: ReadonlyArray<{ id: string; name: string; kind: string }>;
}>;

const fieldClass =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function PolicyForm({
  clinicId,
  patientId,
  patientName,
  providers,
}: PolicyFormProps) {
  return (
    <form action={createInsurancePolicyAction} className="space-y-5">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patientId} />
      <div className="rounded-lg bg-teal-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-800">
          Patient
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {patientName}
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="providerId">
          Insurer or TPA
        </label>
        <select
          className={fieldClass}
          id="providerId"
          name="providerId"
          required
        >
          <option value="">Choose a provider</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
              {provider.kind === "TPA" ? " (TPA)" : ""}
            </option>
          ))}
        </select>
        {providers.length === 0 && (
          <p className="mt-2 text-sm text-amber-800">
            Add an active insurer or TPA before creating a policy.
          </p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="policyNumber">
            Policy number
          </label>
          <input
            autoComplete="off"
            className={fieldClass}
            id="policyNumber"
            maxLength={120}
            name="policyNumber"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            Keep this identifier private; list views mask it.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="memberReference">
            Member reference (optional)
          </label>
          <input
            autoComplete="off"
            className={fieldClass}
            id="memberReference"
            maxLength={120}
            name="memberReference"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="validFrom">
            Valid from
          </label>
          <input
            className={fieldClass}
            id="validFrom"
            name="validFrom"
            required
            type="date"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="validUntil">
            Valid until
          </label>
          <input
            className={fieldClass}
            id="validUntil"
            name="validUntil"
            required
            type="date"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="coverageLimit">
            Coverage limit (INR)
          </label>
          <input
            className={fieldClass}
            id="coverageLimit"
            min="0"
            name="coverageLimit"
            step="0.01"
            type="number"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="deductible">
            Deductible (INR)
          </label>
          <input
            className={fieldClass}
            id="deductible"
            min="0"
            name="deductible"
            step="0.01"
            type="number"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="coPaymentPercent">
            Co-payment (%)
          </label>
          <input
            className={fieldClass}
            id="coPaymentPercent"
            max="100"
            min="0"
            name="coPaymentPercent"
            step="0.01"
            type="number"
          />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="exclusions">
          Exclusions
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
          id="exclusions"
          maxLength={10000}
          name="exclusions"
          rows={3}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="coverageNotes">
          Coverage notes
        </label>
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
          id="coverageNotes"
          maxLength={5000}
          name="coverageNotes"
          rows={3}
        />
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
        Entered limits and notes are reference information only. They do not
        confirm that a treatment is covered.
      </p>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
          href={`/clinic/${clinicId}/patients/${patientId}`}
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={providers.length === 0}
          type="submit"
        >
          Save policy
        </button>
      </div>
    </form>
  );
}
