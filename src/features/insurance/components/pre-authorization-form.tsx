import Link from "next/link";

import { createInsurancePreAuthorizationAction } from "@/features/insurance/actions";
import { maskPolicyIdentifier } from "@/features/insurance/lib/insurance-validation";

type PreAuthorizationFormProps = Readonly<{
  clinicId: string;
  patient: { id: string; fullName: string };
  policies: ReadonlyArray<{
    id: string;
    policyNumber: string;
    validFrom: Date;
    validUntil: Date;
    provider: { name: string };
  }>;
  plans: ReadonlyArray<{ id: string; name: string; status: string }>;
}>;

const fieldClass =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function PreAuthorizationForm({
  clinicId,
  patient,
  policies,
  plans,
}: PreAuthorizationFormProps) {
  return (
    <form action={createInsurancePreAuthorizationAction} className="space-y-5">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="patientId" type="hidden" value={patient.id} />
      <div className="rounded-lg bg-teal-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-teal-800">
          Patient
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {patient.fullName}
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="preauth-policy">
            Patient policy
          </label>
          <select
            className={fieldClass}
            id="preauth-policy"
            name="policyId"
            required
          >
            <option value="">Choose a policy</option>
            {policies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.provider.name} ·{" "}
                {maskPolicyIdentifier(policy.policyNumber)} · valid to{" "}
                {policy.validUntil.toISOString().slice(0, 10)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="preauth-plan">
            Treatment plan (optional)
          </label>
          <select
            className={fieldClass}
            defaultValue=""
            id="preauth-plan"
            name="treatmentPlanId"
          >
            <option value="">Not linked</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} · {plan.status.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="proposedTreatment">
            Proposed treatment
          </label>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
            id="proposedTreatment"
            maxLength={2000}
            name="proposedTreatment"
            required
            rows={3}
          />
        </div>
        <div className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="estimatedCost">
              Estimated cost (INR)
            </label>
            <input
              className={fieldClass}
              id="estimatedCost"
              min="0.01"
              name="estimatedCost"
              required
              step="0.01"
              type="number"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="requestReference">
              Request reference (optional)
            </label>
            <input
              className={fieldClass}
              id="requestReference"
              maxLength={120}
              name="requestReference"
            />
          </div>
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
        This is created as a draft estimate. It does not indicate insurer
        approval or confirmed coverage.
      </p>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
          href={`/clinic/${clinicId}/insurance/pre-authorizations`}
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={policies.length === 0}
          type="submit"
        >
          Create draft request
        </button>
      </div>
    </form>
  );
}
