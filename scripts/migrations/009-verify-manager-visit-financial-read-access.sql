WITH expected(table_name,policy_name) AS (VALUES
 ('visit_time_entries','visit_time_entries_manager_select'),
 ('visit_approvals','visit_approvals_manager_select'),
 ('visit_financials','visit_financials_manager_select'),
 ('visit_adjustment_history','visit_adjustment_history_manager_select')
)
SELECT e.table_name,
 c.relrowsecurity AND c.relforcerowsecurity AS forced_rls,
 has_table_privilege('mycaresight_app','public.'||e.table_name,'SELECT') AS runtime_select,
 NOT has_table_privilege('mycaresight_app','public.'||e.table_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS runtime_writes_denied,
 array_agg(p.polname ORDER BY p.polname)=ARRAY[e.policy_name]::name[] AS exact_policy,
 c.relrowsecurity AND c.relforcerowsecurity
 AND has_table_privilege('mycaresight_app','public.'||e.table_name,'SELECT')
 AND NOT has_table_privilege('mycaresight_app','public.'||e.table_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND array_agg(p.polname ORDER BY p.polname)=ARRAY[e.policy_name]::name[] AS read_access_pass
FROM expected e JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
LEFT JOIN pg_policy p ON p.polrelid=c.oid GROUP BY e.table_name,e.policy_name,c.relrowsecurity,c.relforcerowsecurity ORDER BY e.table_name;
