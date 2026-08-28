-- Platform staff need SELECT on agency_admins so the People tab
-- buildPeopleRows merge works when viewed by an admin or expert.
-- agency_key_staff and care_coordinators already have is_platform_staff()
-- in their SELECT policies; agency_admins was the outlier (had it only in UPDATE).
CREATE POLICY "Platform staff can select agency admins"
ON agency_admins FOR SELECT
TO authenticated
USING (is_platform_staff());
