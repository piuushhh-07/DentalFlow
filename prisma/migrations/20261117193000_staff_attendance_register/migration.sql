CREATE TYPE "StaffAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY');

CREATE TABLE "clinic_staff_attendance" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "status" "StaffAttendanceStatus" NOT NULL,
  "checkInAt" TIMESTAMPTZ(6),
  "checkOutAt" TIMESTAMPTZ(6),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_staff_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_staff_attendance_member_fkey"
    FOREIGN KEY ("userId", "clinicId")
    REFERENCES "clinic_memberships" ("userId", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_attendance_recorder_fkey"
    FOREIGN KEY ("recordedByUserId", "clinicId")
    REFERENCES "clinic_memberships" ("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_attendance_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_attendance_time_check"
    CHECK ("checkInAt" IS NULL OR "checkOutAt" IS NULL OR "checkOutAt" >= "checkInAt"),
  CONSTRAINT "clinic_staff_attendance_status_check"
    CHECK (
      ("status" IN ('PRESENT', 'HALF_DAY') AND "checkInAt" IS NOT NULL)
      OR ("status" IN ('ABSENT', 'LEAVE', 'HOLIDAY') AND "checkInAt" IS NULL AND "checkOutAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "clinic_staff_attendance_user_clinic_date_key"
  ON "clinic_staff_attendance"("userId", "clinicId", "attendanceDate");
CREATE INDEX "clinic_staff_attendance_clinic_date_status_idx"
  ON "clinic_staff_attendance"("clinicId", "attendanceDate", "status");
CREATE INDEX "clinic_staff_attendance_clinic_user_date_idx"
  ON "clinic_staff_attendance"("clinicId", "userId", "attendanceDate");
