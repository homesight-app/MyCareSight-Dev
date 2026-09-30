-- 017: Per-agency credentials and idempotent delivery tracking for website leads.
-- Apply and verify before enabling WEBSITE_LEAD_INTEGRATION_ENABLED.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.agencies') IS NULL
     OR to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.leads') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '017 requires agencies, user_profiles, leads, and audit_log';
  END IF;
END
$preflight$;

CREATE TABLE public.lead_integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  key_prefix text NOT NULL UNIQUE CHECK (length(key_prefix) = 12),
  key_hash text NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by uuid NOT NULL REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_by uuid REFERENCES public.user_profiles(id),
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    (status = 'active' AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX lead_integration_credentials_agency_idx
  ON public.lead_integration_credentials (agency_id, created_at DESC);

CREATE TABLE public.lead_integration_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.lead_integration_credentials(id),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  idempotency_key_hash text NOT NULL CHECK (length(idempotency_key_hash) = 64),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_integration_delivery_idempotency_unique
    UNIQUE (credential_id, idempotency_key_hash)
);

CREATE INDEX lead_integration_deliveries_agency_created_idx
  ON public.lead_integration_deliveries (agency_id, created_at DESC);

CREATE TABLE public.lead_integration_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('ip', 'credential')),
  subject_hash text NOT NULL CHECK (length(subject_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_integration_rate_limit_lookup_idx
  ON public.lead_integration_rate_limit_events (scope, subject_hash, created_at DESC);
CREATE INDEX lead_integration_rate_limit_expiry_idx
  ON public.lead_integration_rate_limit_events (created_at);

REVOKE ALL ON public.lead_integration_credentials,
  public.lead_integration_deliveries,
  public.lead_integration_rate_limit_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.lead_integration_rate_limit_events_id_seq FROM PUBLIC;

DO $least_privilege$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mycaresight_jobs') THEN
    REVOKE ALL ON public.lead_integration_credentials,
      public.lead_integration_deliveries,
      public.lead_integration_rate_limit_events FROM mycaresight_jobs;
    REVOKE ALL ON SEQUENCE public.lead_integration_rate_limit_events_id_seq FROM mycaresight_jobs;
  END IF;
END
$least_privilege$;

GRANT SELECT, INSERT, UPDATE ON public.lead_integration_credentials TO mycaresight_app;
GRANT SELECT, INSERT ON public.lead_integration_deliveries TO mycaresight_app;
GRANT SELECT, INSERT, DELETE ON public.lead_integration_rate_limit_events TO mycaresight_app;
GRANT USAGE, SELECT ON SEQUENCE public.lead_integration_rate_limit_events_id_seq TO mycaresight_app;

COMMIT;
