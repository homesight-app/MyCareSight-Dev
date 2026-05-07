-- Give experts SELECT access to the agencies table.
-- Experts are platform staff (is_platform_staff() covers both admin and expert),
-- and they already browse all agencies in the expert portal. The missing policy
-- was forcing code to use createAdminClient() as a workaround.

DROP POLICY IF EXISTS "Admins can view all agencies" ON public.agencies;

CREATE POLICY "Platform staff can view all agencies"
  ON public.agencies
  FOR SELECT
  USING (public.is_platform_staff());
