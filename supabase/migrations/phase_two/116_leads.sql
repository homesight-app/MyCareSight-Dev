-- Migration 116: CRM Lead Management
-- Three tables: leads, lead_notes, lead_tasks
-- lead_type='agency': HomeSights tracking prospective agency clients (platform staff only)
-- lead_type='patient': agency tracking prospective patients (agency members only, HIPAA applies)

-- ──────────────────────────────────────────────────────────────────
-- A. leads
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE public.leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_type             text NOT NULL,
  -- 'agency' | 'patient'

  agency_id             uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- NULL for lead_type='agency' (HomeSights leads); required for lead_type='patient'

  created_by            uuid NOT NULL REFERENCES auth.users(id),
  assigned_to           uuid REFERENCES auth.users(id),

  contact_first_name    text,
  contact_last_name     text,
  contact_email         text,
  contact_phone         text,
  company_name          text,

  service_type          text,
  -- agency leads: 'non_skilled'|'skilled_achc'|'nurse_registry'|'consulting_90_days'|'resurvey_deficiencies'
  -- patient leads: 'companion'|'personal_care'|'skilled_nursing'|'therapy'|'other'

  stage                 text NOT NULL DEFAULT 'new',
  -- 'new'|'contacted'|'proposal_sent'|'verbal'|'probable'|'signed'|'on_hold'|'lost'

  price                 numeric,
  retainer_amount       numeric,
  retainer_paid_date    date,
  installments          int,
  installment_amount    numeric,
  signed_date           date,

  notes                 text,

  converted_agency_id   uuid REFERENCES public.agencies(id),
  converted_client_id   uuid,
  converted_at          timestamptz,

  status                text NOT NULL DEFAULT 'active',
  -- 'active' | 'archived'

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_platform_agency"
  ON public.leads FOR ALL
  USING (lead_type = 'agency' AND public.is_platform_staff())
  WITH CHECK (lead_type = 'agency' AND public.is_platform_staff());

CREATE POLICY "leads_agency_patient"
  ON public.leads FOR ALL
  USING (lead_type = 'patient' AND public.is_agency_member(agency_id))
  WITH CHECK (lead_type = 'patient' AND public.is_agency_member(agency_id));

-- ──────────────────────────────────────────────────────────────────
-- B. lead_notes
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE public.lead_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES auth.users(id),
  content     text NOT NULL,
  note_type   text NOT NULL DEFAULT 'general',
  -- 'call' | 'email' | 'meeting' | 'general'
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_notes_platform"
  ON public.lead_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'agency' AND public.is_platform_staff()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'agency' AND public.is_platform_staff()
    )
  );

CREATE POLICY "lead_notes_agency"
  ON public.lead_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'patient' AND public.is_agency_member(agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'patient' AND public.is_agency_member(agency_id)
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- C. lead_tasks
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE public.lead_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  assigned_to  uuid REFERENCES auth.users(id),
  title        text NOT NULL,
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_tasks_platform"
  ON public.lead_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'agency' AND public.is_platform_staff()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'agency' AND public.is_platform_staff()
    )
  );

CREATE POLICY "lead_tasks_agency"
  ON public.lead_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'patient' AND public.is_agency_member(agency_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_id AND lead_type = 'patient' AND public.is_agency_member(agency_id)
    )
  );
