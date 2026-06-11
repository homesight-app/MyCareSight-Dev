-- Migration 115: Add status column to agencies
-- 'active' | 'inactive' — controls whether an agency is enabled in the platform
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
