begin;

-- =====================================================
-- Helper functions
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_agency_member(p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_admins
    WHERE agency_id = p_agency_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'expert')
  );
$$;

-- =====================================================
-- licenses
-- =====================================================

CREATE POLICY "phase2 licenses select agency or platform"
ON public.licenses
FOR SELECT
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

CREATE POLICY "phase2 licenses insert agency or platform"
ON public.licenses
FOR INSERT
WITH CHECK (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

CREATE POLICY "phase2 licenses update agency or platform"
ON public.licenses
FOR UPDATE
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
)
WITH CHECK (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

CREATE POLICY "phase2 licenses delete agency or platform"
ON public.licenses
FOR DELETE
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

-- =====================================================
-- license_documents
-- =====================================================

CREATE POLICY "phase2 license documents select agency or platform"
ON public.license_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.id = license_documents.license_id
      AND (
        l.company_owner_id = auth.uid()
        OR (l.agency_id IS NOT NULL AND public.is_agency_member(l.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 license documents insert agency or platform"
ON public.license_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.id = license_documents.license_id
      AND (
        l.company_owner_id = auth.uid()
        OR (l.agency_id IS NOT NULL AND public.is_agency_member(l.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 license documents update agency or platform"
ON public.license_documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.id = license_documents.license_id
      AND (
        l.company_owner_id = auth.uid()
        OR (l.agency_id IS NOT NULL AND public.is_agency_member(l.agency_id))
        OR public.is_platform_staff()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.id = license_documents.license_id
      AND (
        l.company_owner_id = auth.uid()
        OR (l.agency_id IS NOT NULL AND public.is_agency_member(l.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 license documents delete agency or platform"
ON public.license_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.licenses l
    WHERE l.id = license_documents.license_id
      AND (
        l.company_owner_id = auth.uid()
        OR (l.agency_id IS NOT NULL AND public.is_agency_member(l.agency_id))
        OR public.is_platform_staff()
      )
  )
);

-- =====================================================
-- applications
-- =====================================================

CREATE POLICY "phase2 applications select agency or platform"
ON public.applications
FOR SELECT
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
  OR assigned_expert_id = auth.uid()
);

CREATE POLICY "phase2 applications insert agency or platform"
ON public.applications
FOR INSERT
WITH CHECK (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

CREATE POLICY "phase2 applications update agency or platform"
ON public.applications
FOR UPDATE
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
)
WITH CHECK (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

CREATE POLICY "phase2 applications delete agency or platform"
ON public.applications
FOR DELETE
USING (
  auth.uid() = company_owner_id
  OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  OR public.is_platform_staff()
);

-- =====================================================
-- application_documents
-- =====================================================

CREATE POLICY "phase2 application documents select agency or platform"
ON public.application_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = application_documents.application_id
      AND (
        a.company_owner_id = auth.uid()
        OR (a.agency_id IS NOT NULL AND public.is_agency_member(a.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 application documents insert agency or platform"
ON public.application_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = application_documents.application_id
      AND (
        a.company_owner_id = auth.uid()
        OR (a.agency_id IS NOT NULL AND public.is_agency_member(a.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 application documents update agency or platform"
ON public.application_documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = application_documents.application_id
      AND (
        a.company_owner_id = auth.uid()
        OR (a.agency_id IS NOT NULL AND public.is_agency_member(a.agency_id))
        OR public.is_platform_staff()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = application_documents.application_id
      AND (
        a.company_owner_id = auth.uid()
        OR (a.agency_id IS NOT NULL AND public.is_agency_member(a.agency_id))
        OR public.is_platform_staff()
      )
  )
);

CREATE POLICY "phase2 application documents delete agency or platform"
ON public.application_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = application_documents.application_id
      AND (
        a.company_owner_id = auth.uid()
        OR (a.agency_id IS NOT NULL AND public.is_agency_member(a.agency_id))
        OR public.is_platform_staff()
      )
  )
);

commit;