-- Add direct playbook reference to applications so clients can request standalone programs
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS playbook_id UUID REFERENCES playbooks(id) ON DELETE SET NULL;
