-- Fix agency_notes.author_id FK to reference user_profiles instead of auth.users.
-- This ensures the FK joins correctly with the application's user profile data.
ALTER TABLE public.agency_notes
  DROP CONSTRAINT agency_notes_author_id_fkey,
  ADD CONSTRAINT agency_notes_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES public.user_profiles(id);
