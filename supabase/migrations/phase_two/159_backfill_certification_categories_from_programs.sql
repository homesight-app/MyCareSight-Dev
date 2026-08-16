-- Backfill category_id / subcategory_id on licenses (certifications) from their linked program.
-- Uses certification_applications junction table to find the source application.
-- Only updates licenses that are missing a category and whose linked application has one.

UPDATE licenses l
SET
  category_id    = a.category_id,
  subcategory_id = a.subcategory_id
FROM certification_applications ca
JOIN applications a ON a.id = ca.application_id
WHERE ca.certification_id = l.id
  AND a.category_id IS NOT NULL
  AND l.category_id IS NULL;
