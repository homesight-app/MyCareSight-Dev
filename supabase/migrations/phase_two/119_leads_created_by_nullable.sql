-- Allow created_by to be null for leads created via the public contact form
-- (no authenticated user exists for website submissions)
ALTER TABLE leads ALTER COLUMN created_by DROP NOT NULL;
