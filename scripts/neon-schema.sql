-- ============================================================
-- MyCareSight — Neon PostgreSQL Schema
-- Generated: 2026-09-12
-- Source: Supabase live DB (UAT project)
-- Changes from Supabase:
--   - All auth.users FK references rewritten to user_profiles(id)
--   - user_profiles.id is a standalone UUID PK (no FK to auth.users)
--   - No RLS policies
--   - No Supabase triggers or extensions
--   - kv_store_3706f9c5 excluded (Supabase internal)
-- Table count: 44
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- TABLES
-- ============================================================

-- Table: agencies
CREATE TABLE IF NOT EXISTS agencies (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  business_type TEXT,
  tax_id TEXT,
  primary_license_number TEXT,
  website TEXT,
  physical_street_address TEXT,
  physical_city TEXT,
  physical_state TEXT,
  physical_zip_code TEXT,
  same_as_physical BOOLEAN DEFAULT TRUE,
  mailing_street_address TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip_code TEXT,
  agency_admin_ids UUID[] DEFAULT '{}'::uuid[],
  dba_name TEXT,
  hours_of_operation TEXT,
  fax_number TEXT,
  date_of_formation DATE,
  npi TEXT,
  onboarding_status TEXT DEFAULT 'shell'::text NOT NULL,
  state_specific_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  phone_number TEXT,
  email TEXT,
  region_service_area TEXT,
  is_on_call BOOLEAN,
  previously_licensed BOOLEAN,
  prev_license_closed_date DATE,
  status TEXT DEFAULT 'active'::text NOT NULL,
  legal_entity_name TEXT,
  entity_type TEXT,
  state_of_incorporation TEXT,
  date_of_incorporation DATE,
  licensed_office_street TEXT,
  licensed_office_city TEXT,
  licensed_office_state TEXT,
  licensed_office_zip TEXT,
  licensed_same_as_physical BOOLEAN DEFAULT FALSE NOT NULL,
  plan_id UUID,
  primary_contact_first_name TEXT,
  primary_contact_last_name TEXT,
  logo_path TEXT,
  logo_icon_path TEXT,
  primary_color TEXT,
  sidebar_color TEXT,
  CONSTRAINT pk_agencies PRIMARY KEY (id)
);

-- Table: license_types
CREATE TABLE IF NOT EXISTS license_types (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  state TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  cost_min NUMERIC,
  cost_max NUMERIC,
  cost_display TEXT NOT NULL,
  processing_time_min INTEGER,
  processing_time_max INTEGER,
  processing_time_display TEXT NOT NULL,
  renewal_period_years INTEGER NOT NULL,
  renewal_period_display TEXT NOT NULL,
  icon_type TEXT NOT NULL,
  requirements JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  service_fee NUMERIC DEFAULT 0,
  service_fee_display TEXT,
  certification_category TEXT DEFAULT 'state_license'::text NOT NULL,
  CONSTRAINT pk_license_types PRIMARY KEY (id)
);

-- Table: task_categories
CREATE TABLE IF NOT EXISTS task_categories (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_task_categories PRIMARY KEY (id)
);

-- Table: configuration_types
CREATE TABLE IF NOT EXISTS configuration_types (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  supports_hierarchy BOOLEAN DEFAULT FALSE NOT NULL,
  is_admin_manageable BOOLEAN DEFAULT TRUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_configuration_types PRIMARY KEY (id)
);

-- Table: pricing
CREATE TABLE IF NOT EXISTS pricing (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  owner_admin_license NUMERIC NOT NULL,
  staff_license NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  effective_date DATE DEFAULT CURRENT_DATE NOT NULL,
  CONSTRAINT pk_pricing PRIMARY KEY (id)
);

-- Table: validation_rules
CREATE TABLE IF NOT EXISTS validation_rules (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  field_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_validation_rules PRIMARY KEY (id)
);

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  phone TEXT,
  job_title TEXT,
  department TEXT,
  work_location TEXT,
  start_date DATE,
  agency_id UUID,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  last_login_at TIMESTAMPTZ,
  password_hash TEXT,
  invite_token TEXT,
  invite_token_expires_at TIMESTAMPTZ,
  CONSTRAINT pk_user_profiles PRIMARY KEY (id)
);

-- Table: agency_admins
CREATE TABLE IF NOT EXISTS agency_admins (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID,
  agency_id UUID,
  expert_id UUID,
  company_owner_id UUID,
  company_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT,
  start_date DATE,
  business_type TEXT,
  tax_id TEXT,
  primary_license_number TEXT,
  website TEXT,
  physical_street_address TEXT,
  physical_city TEXT,
  physical_state TEXT,
  physical_zip_code TEXT,
  mailing_street_address TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_agency_admins PRIMARY KEY (id)
);

-- Table: care_coordinators
CREATE TABLE IF NOT EXISTS care_coordinators (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_care_coordinators PRIMARY KEY (id)
);

-- Table: caregiver_members
CREATE TABLE IF NOT EXISTS caregiver_members (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  company_owner_id UUID,
  user_id UUID,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL,
  job_title TEXT,
  status TEXT DEFAULT 'active'::text NOT NULL,
  employee_id TEXT,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  agency_id UUID,
  address TEXT,
  state TEXT,
  zip_code TEXT,
  skills TEXT[],
  documents JSONB DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT pk_caregiver_members PRIMARY KEY (id)
);

-- Table: licensing_experts
CREATE TABLE IF NOT EXISTS licensing_experts (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'Licensing Specialist'::text NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  expertise TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_profile_id UUID,
  CONSTRAINT pk_licensing_experts PRIMARY KEY (id)
);

-- Table: playbooks
CREATE TABLE IF NOT EXISTS playbooks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  playbook_type TEXT DEFAULT 'license_requirement'::text NOT NULL,
  description TEXT,
  license_requirement_id UUID,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  state TEXT,
  cost_min NUMERIC,
  cost_max NUMERIC,
  cost_display TEXT,
  service_fee NUMERIC,
  service_fee_display TEXT,
  processing_time_min INTEGER,
  processing_time_max INTEGER,
  processing_time_display TEXT,
  renewal_period_years INTEGER,
  renewal_period_display TEXT,
  icon_type TEXT,
  requirements JSONB,
  category_id UUID,
  subcategory_id UUID,
  CONSTRAINT pk_playbooks PRIMARY KEY (id)
);

-- Table: playbook_templates
CREATE TABLE IF NOT EXISTS playbook_templates (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  playbook_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_playbook_templates PRIMARY KEY (id)
);

-- Table: playbook_items
CREATE TABLE IF NOT EXISTS playbook_items (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  playbook_id UUID NOT NULL,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  estimated_days INTEGER,
  document_type TEXT,
  phase TEXT,
  assignment TEXT DEFAULT 'client'::text NOT NULL,
  requirement_type TEXT DEFAULT 'required'::text NOT NULL,
  source_step_id UUID,
  source_document_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_playbook_items PRIMARY KEY (id)
);

-- Table: playbook_item_validation_rules
CREATE TABLE IF NOT EXISTS playbook_item_validation_rules (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  playbook_item_id UUID NOT NULL,
  validation_rule_id UUID NOT NULL,
  rule_order INTEGER NOT NULL,
  is_required BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_playbook_item_validation_rules PRIMARY KEY (id)
);

-- Table: license_requirements
CREATE TABLE IF NOT EXISTS license_requirements (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  state TEXT NOT NULL,
  license_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT pk_license_requirements PRIMARY KEY (id)
);

-- Table: license_requirement_templates
CREATE TABLE IF NOT EXISTS license_requirement_templates (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  license_requirement_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  category TEXT,
  CONSTRAINT pk_license_requirement_templates PRIMARY KEY (id)
);

-- Table: applications
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  company_owner_id UUID,
  state TEXT NOT NULL,
  application_name TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress'::text NOT NULL,
  progress_percentage INTEGER DEFAULT 0,
  started_date DATE NOT NULL,
  last_updated_date DATE NOT NULL,
  submitted_date DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  license_type_id UUID,
  assigned_expert_id UUID,
  revision_reason TEXT,
  caregiver_member_id UUID,
  license_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  days_until_expiry INTEGER,
  issuing_authority TEXT,
  agency_id UUID,
  playbook_id UUID,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  close_reason TEXT,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  complete_reason TEXT,
  category_id UUID,
  subcategory_id UUID,
  CONSTRAINT pk_applications PRIMARY KEY (id)
);

-- Table: licenses
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  company_owner_id UUID,
  state TEXT,
  license_name TEXT NOT NULL,
  license_number TEXT,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  activated_date DATE,
  expiry_date DATE NOT NULL,
  renewal_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  agency_id UUID,
  issuing_body TEXT,
  first_issued_date DATE,
  previous_version_id UUID,
  category_id UUID,
  subcategory_id UUID,
  CONSTRAINT pk_licenses PRIMARY KEY (id)
);

-- Table: leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  lead_type TEXT NOT NULL,
  agency_id UUID,
  created_by UUID,
  assigned_to UUID,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  company_name TEXT,
  service_type TEXT,
  stage TEXT DEFAULT 'new'::text NOT NULL,
  price NUMERIC,
  retainer_amount NUMERIC,
  retainer_paid_date DATE,
  installments INTEGER,
  installment_amount NUMERIC,
  signed_date DATE,
  notes TEXT,
  converted_agency_id UUID,
  converted_client_id UUID,
  converted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT,
  sms_consent BOOLEAN,
  contact_address1 TEXT,
  contact_address2 TEXT,
  contact_city TEXT,
  contact_state TEXT,
  contact_zip TEXT,
  lead_owner_id UUID,
  proposal_sent_date DATE,
  service_states TEXT[],
  CONSTRAINT pk_leads PRIMARY KEY (id)
);

-- Table: application_documents
CREATE TABLE IF NOT EXISTS application_documents (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  application_id UUID NOT NULL,
  document_name TEXT NOT NULL,
  document_url TEXT NOT NULL,
  document_type TEXT,
  status TEXT DEFAULT 'draft'::text,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  description TEXT,
  expert_review_notes TEXT,
  license_requirement_document_id UUID,
  application_playbook_item_id UUID,
  CONSTRAINT pk_application_documents PRIMARY KEY (id)
);

-- Table: application_playbook_item_rule_checks
CREATE TABLE IF NOT EXISTS application_playbook_item_rule_checks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  application_playbook_item_id UUID NOT NULL,
  validation_rule_id UUID,
  rule_name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  description TEXT,
  rule_order INTEGER NOT NULL,
  is_required BOOLEAN DEFAULT TRUE NOT NULL,
  is_checked BOOLEAN DEFAULT FALSE NOT NULL,
  checked_by UUID,
  checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_application_playbook_item_rule_checks PRIMARY KEY (id)
);

-- Table: application_steps
CREATE TABLE IF NOT EXISTS application_steps (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  application_id UUID NOT NULL,
  step_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_expert_step BOOLEAN DEFAULT FALSE,
  created_by_expert_id UUID,
  description TEXT,
  phase TEXT,
  instructions TEXT,
  CONSTRAINT pk_application_steps PRIMARY KEY (id)
);

-- Table: agency_documents
CREATE TABLE IF NOT EXISTS agency_documents (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  agency_id UUID NOT NULL,
  document_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  document_type TEXT,
  description TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_agency_documents PRIMARY KEY (id)
);

-- Table: agency_key_staff
CREATE TABLE IF NOT EXISTS agency_key_staff (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  agency_id UUID NOT NULL,
  officer_role TEXT NOT NULL,
  full_legal_name TEXT,
  telephone TEXT,
  email TEXT,
  date_of_birth DATE,
  ssn_encrypted TEXT,
  ssn_last4 CHAR(4),
  home_address_street TEXT,
  home_address_city TEXT,
  home_address_state TEXT,
  home_address_zip TEXT,
  date_of_hire DATE,
  is_licensed BOOLEAN,
  license_type TEXT,
  user_profile_id UUID,
  status TEXT DEFAULT 'active'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ownership_percentage TEXT,
  professional_license_number TEXT,
  employment_type TEXT,
  officer_roles TEXT[] DEFAULT '{}'::text[] NOT NULL,
  CONSTRAINT pk_agency_key_staff PRIMARY KEY (id)
);

-- Table: agency_onboarding_tokens
CREATE TABLE IF NOT EXISTS agency_onboarding_tokens (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  agency_id UUID NOT NULL,
  token UUID DEFAULT gen_random_uuid() NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (now() + '7 days'::interval) NOT NULL,
  use_count INTEGER DEFAULT 0 NOT NULL,
  created_by UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_agency_onboarding_tokens PRIMARY KEY (id)
);

-- Table: cases
CREATE TABLE IF NOT EXISTS cases (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  case_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  state TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress'::text NOT NULL,
  progress_percentage INTEGER DEFAULT 0,
  expert_id UUID,
  documents_count INTEGER DEFAULT 0,
  steps_count INTEGER DEFAULT 0,
  last_activity TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  started_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT pk_cases PRIMARY KEY (id)
);

-- Table: certification_applications
CREATE TABLE IF NOT EXISTS certification_applications (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  certification_id UUID NOT NULL,
  application_id UUID NOT NULL,
  link_type TEXT DEFAULT 'renewal_of'::text NOT NULL,
  linked_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  linked_by UUID,
  CONSTRAINT pk_certification_applications PRIMARY KEY (id)
);

-- Table: configuration_values
CREATE TABLE IF NOT EXISTS configuration_values (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  type_id UUID NOT NULL,
  parent_id UUID,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_configuration_values PRIMARY KEY (id)
);

-- Table: conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  client_id UUID,
  expert_id UUID,
  admin_id UUID,
  last_message_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  application_id UUID,
  CONSTRAINT pk_conversations PRIMARY KEY (id)
);

-- Table: messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_read UUID[] DEFAULT ARRAY[]::uuid[],
  CONSTRAINT pk_messages PRIMARY KEY (id)
);

-- Table: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'general'::text NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  message TEXT,
  icon_type TEXT,
  action_url TEXT,
  CONSTRAINT pk_notifications PRIMARY KEY (id)
);

-- Table: lead_documents
CREATE TABLE IF NOT EXISTS lead_documents (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  lead_id UUID NOT NULL,
  document_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  document_type TEXT,
  description TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_lead_documents PRIMARY KEY (id)
);

-- Table: license_documents
CREATE TABLE IF NOT EXISTS license_documents (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  license_id UUID NOT NULL,
  document_name TEXT NOT NULL,
  document_url TEXT NOT NULL,
  document_type TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  expiry_date DATE,
  CONSTRAINT pk_license_documents PRIMARY KEY (id)
);

-- Table: plan_features
CREATE TABLE IF NOT EXISTS plan_features (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  plan_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  CONSTRAINT pk_plan_features PRIMARY KEY (id)
);

-- Table: patient_addresses
CREATE TABLE IF NOT EXISTS patient_addresses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  patient_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  label TEXT DEFAULT 'Home'::text NOT NULL,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_patient_addresses PRIMARY KEY (id)
);

-- Table: patient_lead_details
CREATE TABLE IF NOT EXISTS patient_lead_details (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  lead_id UUID NOT NULL,
  poc_name TEXT,
  poc_phone TEXT,
  poc_relationship TEXT,
  reason_for_care TEXT,
  mobility_status TEXT,
  cognitive_status TEXT,
  medical_conditions TEXT,
  start_date DATE,
  schedule_type TEXT,
  living_situation TEXT,
  payment_method TEXT,
  insurance_carrier TEXT,
  insurance_policy_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  gender TEXT,
  date_of_birth DATE,
  poc_email TEXT,
  CONSTRAINT pk_patient_lead_details PRIMARY KEY (id)
);

-- Table: patient_skill_requirements
CREATE TABLE IF NOT EXISTS patient_skill_requirements (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  agency_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  skill_codes TEXT[] DEFAULT '{}'::text[] NOT NULL,
  legacy_caregiver_requirements_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_patient_skill_requirements PRIMARY KEY (id)
);

-- Table: schedule_assignment_requests
CREATE TABLE IF NOT EXISTS schedule_assignment_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  schedule_id UUID NOT NULL,
  caregiver_member_id UUID,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  caregiver_note TEXT,
  decline_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT pk_schedule_assignment_requests PRIMARY KEY (id)
);

-- Table: schedule_unassignment_requests
CREATE TABLE IF NOT EXISTS schedule_unassignment_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  schedule_id UUID NOT NULL,
  caregiver_member_id UUID NOT NULL,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  decline_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT pk_schedule_unassignment_requests PRIMARY KEY (id)
);

-- Table: system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT NOT NULL,
  category TEXT DEFAULT 'branding'::text NOT NULL,
  value TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Table: validation_runs
CREATE TABLE IF NOT EXISTS validation_runs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  application_playbook_item_id UUID NOT NULL,
  run_number INTEGER NOT NULL,
  extraction_status TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_by UUID,
  passed_count INTEGER DEFAULT 0 NOT NULL,
  failed_count INTEGER DEFAULT 0 NOT NULL,
  needs_review_count INTEGER DEFAULT 0 NOT NULL,
  results JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_validation_runs PRIMARY KEY (id)
);

-- Table: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  agency_id UUID,
  patient_id UUID,
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  performed_by_user_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_audit_log PRIMARY KEY (id)
);

-- Table: user_agency_roles
CREATE TABLE IF NOT EXISTS user_agency_roles (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  agency_id UUID NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pk_user_agency_roles PRIMARY KEY (id)
);

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================

ALTER TABLE caregiver_members ADD CONSTRAINT fk_caregiver_members_user_id FOREIGN KEY (user_id) REFERENCES user_profiles(id);
ALTER TABLE licensing_experts ADD CONSTRAINT fk_licensing_experts_user_id FOREIGN KEY (user_id) REFERENCES user_profiles(id);
ALTER TABLE applications ADD CONSTRAINT fk_applications_assigned_expert_id FOREIGN KEY (assigned_expert_id) REFERENCES user_profiles(id);
ALTER TABLE applications ADD CONSTRAINT fk_applications_company_owner_id FOREIGN KEY (company_owner_id) REFERENCES user_profiles(id);
ALTER TABLE licenses ADD CONSTRAINT fk_licenses_company_owner_id FOREIGN KEY (company_owner_id) REFERENCES user_profiles(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_created_by FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_assigned_to FOREIGN KEY (assigned_to) REFERENCES user_profiles(id);
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES user_profiles(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_sender_id FOREIGN KEY (sender_id) REFERENCES user_profiles(id);
ALTER TABLE conversations ADD CONSTRAINT fk_conversations_admin_id FOREIGN KEY (admin_id) REFERENCES user_profiles(id);
ALTER TABLE agency_documents ADD CONSTRAINT fk_agency_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES user_profiles(id);
ALTER TABLE agency_onboarding_tokens ADD CONSTRAINT fk_agency_onboarding_tokens_created_by FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE application_steps ADD CONSTRAINT fk_application_steps_completed_by FOREIGN KEY (completed_by) REFERENCES user_profiles(id);
ALTER TABLE application_steps ADD CONSTRAINT fk_application_steps_created_by_expert_id FOREIGN KEY (created_by_expert_id) REFERENCES user_profiles(id);
ALTER TABLE lead_documents ADD CONSTRAINT fk_lead_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES user_profiles(id);
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES user_profiles(id);
ALTER TABLE schedule_assignment_requests ADD CONSTRAINT fk_schedule_assignment_requests_resolved_by FOREIGN KEY (resolved_by) REFERENCES user_profiles(id);
ALTER TABLE schedule_unassignment_requests ADD CONSTRAINT fk_schedule_unassignment_requests_resolved_by FOREIGN KEY (resolved_by) REFERENCES user_profiles(id);
ALTER TABLE validation_runs ADD CONSTRAINT fk_validation_runs_completed_by FOREIGN KEY (completed_by) REFERENCES user_profiles(id);
ALTER TABLE agency_admins ADD CONSTRAINT fk_agency_admins_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE agency_documents ADD CONSTRAINT fk_agency_documents_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE agency_key_staff ADD CONSTRAINT fk_agency_key_staff_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE agency_onboarding_tokens ADD CONSTRAINT fk_agency_onboarding_tokens_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE applications ADD CONSTRAINT fk_applications_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE applications ADD CONSTRAINT fk_applications_license_type_id FOREIGN KEY (license_type_id) REFERENCES license_types(id);
ALTER TABLE application_documents ADD CONSTRAINT fk_application_documents_application_id FOREIGN KEY (application_id) REFERENCES applications(id);
ALTER TABLE application_playbook_item_rule_checks ADD CONSTRAINT fk_application_playbook_item_rule_checks_validation_rule_id FOREIGN KEY (validation_rule_id) REFERENCES validation_rules(id);
ALTER TABLE application_steps ADD CONSTRAINT fk_application_steps_application_id FOREIGN KEY (application_id) REFERENCES applications(id);
ALTER TABLE care_coordinators ADD CONSTRAINT fk_care_coordinators_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE caregiver_members ADD CONSTRAINT fk_caregiver_members_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE configuration_values ADD CONSTRAINT fk_configuration_values_type_id FOREIGN KEY (type_id) REFERENCES configuration_types(id);
ALTER TABLE configuration_values ADD CONSTRAINT fk_configuration_values_parent_id FOREIGN KEY (parent_id) REFERENCES configuration_values(id);
ALTER TABLE lead_documents ADD CONSTRAINT fk_lead_documents_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE license_documents ADD CONSTRAINT fk_license_documents_license_id FOREIGN KEY (license_id) REFERENCES licenses(id);
ALTER TABLE licenses ADD CONSTRAINT fk_licenses_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation_id FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE patient_lead_details ADD CONSTRAINT fk_patient_lead_details_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE playbook_item_validation_rules ADD CONSTRAINT fk_playbook_item_validation_rules_playbook_item_id FOREIGN KEY (playbook_item_id) REFERENCES playbook_items(id);
ALTER TABLE playbook_item_validation_rules ADD CONSTRAINT fk_playbook_item_validation_rules_validation_rule_id FOREIGN KEY (validation_rule_id) REFERENCES validation_rules(id);
ALTER TABLE playbook_items ADD CONSTRAINT fk_playbook_items_playbook_id FOREIGN KEY (playbook_id) REFERENCES playbooks(id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agency_admins_agency_id ON agency_admins (agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_admins_user_id ON agency_admins (user_id);
CREATE INDEX IF NOT EXISTS idx_agency_documents_agency_id ON agency_documents (agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_documents_uploaded_by ON agency_documents (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_agency_key_staff_agency_id ON agency_key_staff (agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_onboarding_tokens_agency_id ON agency_onboarding_tokens (agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_onboarding_tokens_created_by ON agency_onboarding_tokens (created_by);
CREATE INDEX IF NOT EXISTS idx_applications_agency_id ON applications (agency_id);
CREATE INDEX IF NOT EXISTS idx_applications_license_type_id ON applications (license_type_id);
CREATE INDEX IF NOT EXISTS idx_applications_assigned_expert_id ON applications (assigned_expert_id);
CREATE INDEX IF NOT EXISTS idx_applications_company_owner_id ON applications (company_owner_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);
CREATE INDEX IF NOT EXISTS idx_application_documents_application_id ON application_documents (application_id);
CREATE INDEX IF NOT EXISTS idx_application_steps_application_id ON application_steps (application_id);
CREATE INDEX IF NOT EXISTS idx_care_coordinators_agency_id ON care_coordinators (agency_id);
CREATE INDEX IF NOT EXISTS idx_caregiver_members_agency_id ON caregiver_members (agency_id);
CREATE INDEX IF NOT EXISTS idx_caregiver_members_user_id ON caregiver_members (user_id);
CREATE INDEX IF NOT EXISTS idx_configuration_values_type_id ON configuration_values (type_id);
CREATE INDEX IF NOT EXISTS idx_configuration_values_parent_id ON configuration_values (parent_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead_id ON lead_documents (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_uploaded_by ON lead_documents (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_leads_agency_id ON leads (agency_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads (created_by);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_license_documents_license_id ON license_documents (license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_agency_id ON licenses (agency_id);
CREATE INDEX IF NOT EXISTS idx_licenses_company_owner_id ON licenses (company_owner_id);
CREATE INDEX IF NOT EXISTS idx_licensing_experts_user_id ON licensing_experts (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_patient_addresses_patient_id ON patient_addresses (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_lead_details_lead_id ON patient_lead_details (lead_id);
CREATE INDEX IF NOT EXISTS idx_patient_skill_requirements_patient_id ON patient_skill_requirements (patient_id);
CREATE INDEX IF NOT EXISTS idx_playbook_items_playbook_id ON playbook_items (playbook_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (email);
