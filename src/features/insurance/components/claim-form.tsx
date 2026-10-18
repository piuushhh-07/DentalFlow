import Link from "next/link";

import { createInsuranceClaimAction } from "@/features/insurance/actions";
import { maskPolicyIdentifier } from "@/features/insurance/lib/insurance-validation";

type ClaimFormProps = Readonly<{
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
  preAuthorizations: ReadonlyArray<{
    id: string;
    status: string;
    proposedTreatment: string;
    policy: { id: string; provider: { name: string } };
  }>;
}>;

const fieldClass =
  "h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function ClaimForm({
  clinicId,
  patient,
  policies,
  plans,
  preAuthorizations,
}: ClaimFormProps) {
  return (
    <form action={createInsuranceClaimAction} className="space-y-5">
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
          <label className={labelClass} htmlFor="claim-type">
            Claim workflow
          </label>
          <select
            className={fieldClass}
            defaultValue="CASHLESS"
            id="claim-type"
            name="type"
          >
            <option value="CASHLESS">Cashless</option>
            <option value="REIMBURSEMENT">Patient reimbursement</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="policyId">
            Patient policy
          </label>
          <select className={fieldClass} id="policyId" name="policyId" required>
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
          <label className={labelClass} htmlFor="treatmentPlanId">
            Treatment plan (optional)
          </label>
          <select
            className={fieldClass}
            defaultValue=""
            id="treatmentPlanId"
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
          <label className={labelClass} htmlFor="preAuthorizationId">
            Approved pre-authorization (optional)
          </label>
          <select
            className={fieldClass}
            defaultValue=""
            id="preAuthorizationId"
            name="preAuthorizationId"
          >
            <option value="">Not linked</option>
            {preAuthorizations.map((request) => (
              <option key={request.id} value={request.id}>
                {request.policy.provider.name} · {request.status.toLowerCase()}{" "}
                · {request.proposedTreatment}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Only approved or partially approved requests are linkable.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="treatmentDetails">
            Treatment details
          </label>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
            id="treatmentDetails"
            maxLength={2000}
            name="treatmentDetails"
            required
            rows={3}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="treatmentDate">
            Treatment date
          </label>
          <input
            className={fieldClass}
            id="treatmentDate"
            name="treatmentDate"
            required
            type="date"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="claimReference">
            Claim reference (optional)
          </label>
          <input
            className={fieldClass}
            id="claimReference"
            maxLength={120}
            name="claimReference"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="estimatedCost">
            Estimated treatment cost (INR)
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
          <label className={labelClass} htmlFor="amountClaimed">
            Amount claimed (INR)
          </label>
          <input
            className={fieldClass}
            id="amountClaimed"
            min="0.01"
            name="amountClaimed"
            required
            step="0.01"
            type="number"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="claim-notes">
            Internal notes
          </label>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
            id="claim-notes"
            maxLength={10000}
            name="notes"
            rows={3}
          />
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
        An estimate or submitted claim is not an insurer approval. Approval
        amounts are recorded only after the insurer responds.
      </p>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50"
          href={`/clinic/${clinicId}/insurance/claims`}
        >
          Cancel
        </Link>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={policies.length === 0}
          type="submit"
        >
          Create draft claim
        </button>
      </div>
    </form>
  );
}
