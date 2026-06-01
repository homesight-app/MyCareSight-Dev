-- HIPAA: PHI document buckets must not be publicly accessible.
-- Signed URLs (createSignedUrl) are required for all client access going forward.
UPDATE storage.buckets
SET public = false
WHERE id IN (
  'patient-documents',
  'staff-member-documents',
  'application-documents'
);
