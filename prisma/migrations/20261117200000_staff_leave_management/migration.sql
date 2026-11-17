CREATE TYPE "StaffLeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "clinic_staff_leave_requests" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" "StaffLeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "reviewerNotes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_staff_leave_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_staff_leave_requests_membership_fkey"
    FOREIGN KEY ("userId", "clinicId")
    REFERENCES "clinic_memberships" ("userId", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_leave_requests_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_leave_requests_reviewer_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "user_profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_leave_requests_date_check"
    CHECK ("endDate" >= "startDate"),
  CONSTRAINT "clinic_staff_leave_requests_review_check"
    CHECK (
      ("status" = 'PENDING' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
    )
);

CREATE INDEX "clinic_staff_leave_requests_clinic_status_start_idx"
  ON "clinic_staff_leave_requests"("clinicId", "status", "startDate");
CREATE INDEX "clinic_staff_leave_requests_clinic_user_dates_idx"
  ON "clinic_staff_leave_requests"("clinicId", "userId", "startDate", "endDate");
CREATE INDEX "clinic_staff_leave_requests_reviewer_idx"
  ON "clinic_staff_leave_requests"("reviewedByUserId");

-- These HR records are read and written only through server-side Prisma
-- after clinic membership and role checks, never directly through Supabase Data API.
ALTER TABLE public.clinic_staff_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_staff_attendance
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.clinic_staff_leave_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinic_staff_leave_requests
  FROM PUBLIC, anon, authenticated, service_role;
