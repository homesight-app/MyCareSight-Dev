CREATE INDEX IF NOT EXISTS idx_patients_agency_status ON patients(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_agency_status ON applications(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_agency_status ON leads(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_licenses_agency_status ON licenses(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_agency_created ON patients(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_agency_created ON audit_log(agency_id, created_at DESC);
