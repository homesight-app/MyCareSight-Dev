-- Remove the one-playbook-per-license-requirement constraint.
-- The link field has been removed from the UI; playbooks now stand alone.
DROP INDEX IF EXISTS playbooks_license_req_idx;
