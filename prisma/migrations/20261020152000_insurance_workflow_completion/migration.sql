ALTER TABLE "insurance_activities"
ADD COLUMN "policyId" UUID,
ADD COLUMN "providerId" UUID;

CREATE UNIQUE INDEX "insurance_policies_id_clinicId_key"
ON "insurance_policies"("id", "clinicId");

CREATE INDEX "insurance_activities_clinicId_policyId_createdAt_idx"
ON "insurance_activities"("clinicId", "policyId", "createdAt");

CREATE INDEX "insurance_activities_clinicId_providerId_createdAt_idx"
ON "insurance_activities"("clinicId", "providerId", "createdAt");

ALTER TABLE "insurance_activities"
ADD CONSTRAINT "insurance_activities_policyId_clinicId_fkey"
FOREIGN KEY ("policyId", "clinicId")
REFERENCES "insurance_policies"("id", "clinicId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insurance_activities"
ADD CONSTRAINT "insurance_activities_providerId_clinicId_fkey"
FOREIGN KEY ("providerId", "clinicId")
REFERENCES "insurance_providers"("id", "clinicId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insurance_activities"
DROP CONSTRAINT "insurance_activities_one_parent_check";

ALTER TABLE "insurance_activities"
ADD CONSTRAINT "insurance_activities_one_parent_check"
CHECK (
  num_nonnulls("claimId", "preAuthorizationId", "policyId", "providerId") = 1
);
