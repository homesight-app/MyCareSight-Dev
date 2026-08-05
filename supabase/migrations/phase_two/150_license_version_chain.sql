-- Migration 150: Add version chain support to licenses
-- Allows certification records to be linked as a renewal chain:
--   new cert → previous_version_id → older cert → ...

ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS previous_version_id uuid
    REFERENCES licenses(id) ON DELETE SET NULL;
