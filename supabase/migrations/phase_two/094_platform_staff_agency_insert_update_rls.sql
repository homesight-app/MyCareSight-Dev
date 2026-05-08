-- Fix: experts receive RLS denial when creating an agency from the expert portal.
-- The existing INSERT policy on agencies is admin-only. Experts are platform staff
-- and legitimately need to create and manage agencies. Adding INSERT policies for
-- is_platform_staff() on agencies and the agency_admins update that follows.

-- Allow platform staff (admin + expert) to INSERT new agencies
CREATE POLICY "Platform staff can insert agencies"
  ON public.agencies FOR INSERT
  WITH CHECK (public.is_platform_staff());

-- Allow platform staff to UPDATE agency_admins rows (e.g. set company_name/agency_id
-- when assigning an admin to the newly created agency)
CREATE POLICY "Platform staff can update agency admins"
  ON public.agency_admins FOR UPDATE
  USING (public.is_platform_staff());
