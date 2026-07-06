-- Rename existing generic address rule to be specific about which address it checks
UPDATE public.validation_rules
SET name        = 'Office Address',
    description = 'Verify the licensed office address on the document matches the agency record.'
WHERE field_key = 'office_address';

-- Add Corporate Address rule (maps to agencies.physical_street_address / city / state / zip_code)
INSERT INTO public.validation_rules (name, field_key, description, is_active, sort_order)
VALUES (
  'Corporate Address',
  'corporate_address',
  'Verify the corporate / principal place of business address matches the agency record.',
  true,
  5
);

-- Add Mailing Address rule (maps to agencies.mailing_street_address / city / state / mailing_zip_code)
INSERT INTO public.validation_rules (name, field_key, description, is_active, sort_order)
VALUES (
  'Mailing Address',
  'mailing_address',
  'Verify the mailing address on the document matches the agency record.',
  true,
  6
);
