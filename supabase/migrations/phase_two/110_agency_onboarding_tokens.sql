-- Migration 110: Agency onboarding tokens
-- Secure time-limited links for agencies to fill out their own profile

CREATE TABLE public.agency_onboarding_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  token       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  use_count   int NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agency_onboarding_tokens_agency_id_idx ON public.agency_onboarding_tokens(agency_id);
CREATE INDEX agency_onboarding_tokens_token_idx ON public.agency_onboarding_tokens(token);

ALTER TABLE public.agency_onboarding_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_tokens_platform"
  ON public.agency_onboarding_tokens
  FOR ALL
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());
