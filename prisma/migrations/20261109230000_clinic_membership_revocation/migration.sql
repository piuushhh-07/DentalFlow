ALTER TABLE "clinic_memberships"
ADD COLUMN "revokedAt" TIMESTAMPTZ(6);

CREATE INDEX "clinic_memberships_clinicId_revokedAt_role_idx"
ON "clinic_memberships"("clinicId", "revokedAt", "role");
