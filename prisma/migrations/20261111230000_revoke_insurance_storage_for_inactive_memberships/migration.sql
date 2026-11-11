-- Revoked or deactivated clinic memberships must immediately lose insurance-file access.
CREATE OR REPLACE FUNCTION public.can_access_insurance_storage_object(
  object_name text,
  access_mode text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clinic_folder text := split_part(object_name, '/', 1);
  claim_folder text := split_part(object_name, '/', 2);
  document_folder text := split_part(object_name, '/', 3);
BEGIN
  IF array_length(string_to_array(object_name, '/'), 1) <> 4
    OR clinic_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR claim_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR document_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR split_part(object_name, '/', 4) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_memberships membership
    JOIN public.insurance_claims claim
      ON claim."clinicId" = membership."clinicId"
     AND claim."id" = claim_folder::uuid
    JOIN public.insurance_documents document
      ON document."clinicId" = claim."clinicId"
     AND document."claimId" = claim."id"
     AND document."id" = document_folder::uuid
    WHERE membership."userId" = auth.uid()
      AND membership."clinicId" = clinic_folder::uuid
      AND membership."active" = true
      AND membership."revokedAt" IS NULL
      AND CASE access_mode
        WHEN 'read' THEN document."storagePath" = object_name
        WHEN 'upload' THEN document."status" IN ('REQUIRED', 'REJECTED')
          AND EXISTS (
            SELECT 1
            FROM public.insurance_document_storage_cleanup cleanup
            WHERE cleanup.storage_path = object_name
              AND cleanup.clinic_id = document."clinicId"
              AND cleanup.claim_id = document."claimId"
              AND cleanup.document_id = document."id"
          )
        WHEN 'delete' THEN EXISTS (
            SELECT 1
            FROM public.insurance_document_storage_cleanup cleanup
            WHERE cleanup.storage_path = object_name
              AND cleanup.clinic_id = document."clinicId"
              AND cleanup.claim_id = document."claimId"
              AND cleanup.document_id = document."id"
              AND document."storagePath" IS DISTINCT FROM object_name
          )
        ELSE false
      END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_insurance_storage_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_insurance_storage_object(text, text) TO authenticated;
