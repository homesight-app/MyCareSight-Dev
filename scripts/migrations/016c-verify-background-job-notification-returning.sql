-- Read-only verification for migration 016c. Expect access_pass=true.
SELECT
  has_column_privilege('mycaresight_jobs', 'public.notifications', 'id', 'SELECT')
    AS notification_id_readable,
  NOT has_table_privilege('mycaresight_jobs', 'public.notifications', 'SELECT')
    AND NOT has_column_privilege('mycaresight_jobs', 'public.notifications', 'message', 'SELECT')
    AND NOT has_column_privilege('mycaresight_jobs', 'public.notifications', 'user_id', 'SELECT')
    AS notification_content_blocked,
  has_column_privilege('mycaresight_jobs', 'public.notifications', 'id', 'SELECT')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.notifications', 'SELECT')
    AND NOT has_column_privilege('mycaresight_jobs', 'public.notifications', 'message', 'SELECT')
    AND NOT has_column_privilege('mycaresight_jobs', 'public.notifications', 'user_id', 'SELECT')
    AS access_pass;
