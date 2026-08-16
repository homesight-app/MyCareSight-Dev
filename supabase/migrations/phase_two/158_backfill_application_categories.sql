-- Backfill category_id / subcategory_id on applications from their linked playbook.
-- Covers applications that have a direct playbook_id reference (the standard flow).

UPDATE applications a
SET
  category_id    = p.category_id,
  subcategory_id = p.subcategory_id
FROM playbooks p
WHERE a.playbook_id = p.id
  AND p.category_id IS NOT NULL
  AND (a.category_id IS NULL OR a.subcategory_id IS DISTINCT FROM p.subcategory_id);
