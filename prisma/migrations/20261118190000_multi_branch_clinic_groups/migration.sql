CREATE TABLE "clinic_groups" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_groups_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "user_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "clinics" ADD COLUMN "clinicGroupId" UUID;
ALTER TABLE "clinics"
  ADD CONSTRAINT "clinics_clinicGroupId_fkey"
  FOREIGN KEY ("clinicGroupId") REFERENCES "clinic_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "clinic_groups_ownerUserId_createdAt_idx"
  ON "clinic_groups"("ownerUserId", "createdAt");
CREATE INDEX "clinics_clinicGroupId_idx" ON "clinics"("clinicGroupId");

ALTER TABLE public.clinic_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_groups FROM PUBLIC, anon, authenticated, service_role;
