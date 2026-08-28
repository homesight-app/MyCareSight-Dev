CREATE INDEX IF NOT EXISTS idx_audit_log_agency_id ON audit_log(agency_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
