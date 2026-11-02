-- PostgreSQL partial unique index: Prisma schema does not model partial indexes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "appointments"
    WHERE "treatmentVisitId" IS NOT NULL
      AND "status" NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')
    GROUP BY "clinicId", "treatmentVisitId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one active appointment per treatment visit: duplicate active links exist.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "appointments_one_active_per_treatment_visit"
ON "appointments" ("clinicId", "treatmentVisitId")
WHERE "treatmentVisitId" IS NOT NULL
  AND "status" NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');
