$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$psql = Join-Path $pgBin 'psql.exe'

if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
    throw "PostgreSQL 18 psql was not found at: $psql"
}

function Read-SecretText {
    param([Parameter(Mandatory)][string]$Prompt)

    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

    try {
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function ConvertFrom-PgUrl {
    param([Parameter(Mandatory)][string]$ConnectionString)

    $uri = [Uri]::new($ConnectionString.Trim())
    if ($uri.Scheme -notin @('postgres', 'postgresql')) {
        throw 'Connection strings must begin with postgres:// or postgresql://.'
    }

    $userParts = $uri.UserInfo -split ':', 2
    if ($userParts.Count -ne 2) {
        throw 'The connection string does not contain a username and password.'
    }

    [pscustomobject]@{
        Host     = $uri.Host
        Port     = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
        User     = [Uri]::UnescapeDataString($userParts[0])
        Password = [Uri]::UnescapeDataString($userParts[1])
        Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    }
}

function Clear-PgEnvironment {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
    Remove-Item Env:PGCHANNELBINDING -ErrorAction SilentlyContinue
}

function Invoke-PgQuery {
    param(
        [Parameter(Mandatory)]$Connection,
        [Parameter(Mandatory)][string]$Sql
    )

    $env:PGPASSWORD = $Connection.Password
    $env:PGSSLMODE = 'require'
    $env:PGCHANNELBINDING = 'require'

    try {
        $result = @(
            & $psql `
                "--host=$($Connection.Host)" `
                "--port=$($Connection.Port)" `
                "--username=$($Connection.User)" `
                "--dbname=$($Connection.Database)" `
                -X -w -qAt -v ON_ERROR_STOP=1 -c $Sql
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Validation query failed against $($Connection.Host)."
        }

        @($result | Where-Object { $_ -ne '' })
    }
    finally {
        Clear-PgEnvironment
    }
}

$tableCountSql = @'
CREATE TEMP TABLE validation_table_counts (
    schema_name text,
    table_name text,
    row_count bigint
);

DO $validation$
DECLARE
    item record;
    counted_rows bigint;
BEGIN
    FOR item IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND n.nspname = 'public'
        ORDER BY n.nspname, c.relname
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM %I.%I',
            item.schema_name,
            item.table_name
        )
        INTO counted_rows;

        INSERT INTO validation_table_counts
        VALUES (item.schema_name, item.table_name, counted_rows);
    END LOOP;
END
$validation$;

SELECT format('%I.%I|%s', schema_name, table_name, row_count)
FROM validation_table_counts
ORDER BY schema_name, table_name;
'@

$sequenceSql = @'
CREATE TEMP TABLE validation_sequence_state (
    schema_name text,
    sequence_name text,
    last_value text,
    is_called boolean
);

DO $validation$
DECLARE
    item record;
    current_value text;
    sequence_called boolean;
BEGIN
    FOR item IN
        SELECT n.nspname AS schema_name, c.relname AS sequence_name
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S'
          AND n.nspname = 'public'
        ORDER BY n.nspname, c.relname
    LOOP
        EXECUTE format(
            'SELECT last_value::text, is_called FROM %I.%I',
            item.schema_name,
            item.sequence_name
        )
        INTO current_value, sequence_called;

        INSERT INTO validation_sequence_state
        VALUES (
            item.schema_name,
            item.sequence_name,
            current_value,
            sequence_called
        );
    END LOOP;
END
$validation$;

SELECT format(
    '%I.%I|%s|%s',
    schema_name,
    sequence_name,
    last_value,
    is_called
)
FROM validation_sequence_state
ORDER BY schema_name, sequence_name;
'@

$catalogSql = @'
SELECT metric || '|' || object_count
FROM (
    SELECT 'constraints' AS metric, count(*)::text AS object_count
    FROM pg_constraint AS c
    JOIN pg_namespace AS n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'

    UNION ALL

    SELECT 'functions', count(*)::text
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'

    UNION ALL

    SELECT 'indexes', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'i'

    UNION ALL

    SELECT 'policies', count(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'

    UNION ALL

    SELECT 'rls_enabled_tables', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity

    UNION ALL

    SELECT 'rls_forced_tables', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relforcerowsecurity

    UNION ALL

    SELECT 'sequences', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'

    UNION ALL

    SELECT 'tables', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')

    UNION ALL

    SELECT 'triggers', count(*)::text
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal

    UNION ALL

    SELECT 'views', count(*)::text
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
) AS metrics
ORDER BY metric;
'@

$extensionSql = @'
SELECT extname || '|' || extversion
FROM pg_extension
WHERE extname IN ('pgcrypto', 'plpgsql', 'uuid-ossp')
ORDER BY extname;
'@

$roleSql = @'
SELECT
    rolname || '|' ||
    rolcanlogin || '|' ||
    rolsuper || '|' ||
    rolcreatedb || '|' ||
    rolcreaterole || '|' ||
    rolinherit || '|' ||
    rolbypassrls
FROM pg_roles
WHERE rolname IN ('mycaresight_app', 'mycaresight_jobs')
ORDER BY rolname;
'@

$rlsSql = @'
SELECT concat_ws(
    '|',
    n.nspname,
    c.relname,
    c.relrowsecurity::text,
    c.relforcerowsecurity::text
)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND (c.relrowsecurity OR c.relforcerowsecurity)
ORDER BY n.nspname, c.relname;
'@

$policySql = @'
SELECT concat_ws(
    '|',
    schemaname,
    tablename,
    policyname,
    permissive,
    array_to_string(roles, ','),
    cmd,
    COALESCE(qual, '<NULL>'),
    COALESCE(with_check, '<NULL>')
)
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY schemaname, tablename, policyname;
'@

$relationGrantSql = @'
SELECT concat_ws(
    '|',
    n.nspname,
    c.relname,
    c.relkind::text,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable::text
)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) AS expanded
LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
WHERE n.nspname = 'public'
  AND (
      expanded.grantee = 0
      OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
  )
ORDER BY
    n.nspname,
    c.relname,
    c.relkind,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable;
'@

$columnGrantSql = @'
SELECT concat_ws(
    '|',
    n.nspname,
    c.relname,
    a.attname,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable::text
)
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) AS expanded
LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
WHERE n.nspname = 'public'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
      expanded.grantee = 0
      OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
  )
ORDER BY
    n.nspname,
    c.relname,
    a.attname,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable;
'@

$functionGrantSql = @'
SELECT concat_ws(
    '|',
    n.nspname,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable::text
)
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl, acldefault('f', p.proowner))
) AS expanded
LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
WHERE n.nspname = 'public'
  AND (
      expanded.grantee = 0
      OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
  )
ORDER BY
    n.nspname,
    p.proname,
    pg_get_function_identity_arguments(p.oid),
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable;
'@

$defaultGrantSql = @'
SELECT concat_ws(
    '|',
    owner_role.rolname,
    COALESCE(n.nspname, '<ALL_SCHEMAS>'),
    defaults.defaclobjtype::text,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable::text
)
FROM pg_default_acl AS defaults
JOIN pg_roles AS owner_role ON owner_role.oid = defaults.defaclrole
LEFT JOIN pg_namespace AS n ON n.oid = defaults.defaclnamespace
CROSS JOIN LATERAL aclexplode(defaults.defaclacl) AS expanded
LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
WHERE
    expanded.grantee = 0
    OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
ORDER BY
    owner_role.rolname,
    COALESCE(n.nspname, '<ALL_SCHEMAS>'),
    defaults.defaclobjtype,
    COALESCE(grantee.rolname, 'PUBLIC'),
    expanded.privilege_type,
    expanded.is_grantable;
'@

$databaseAndSchemaGrantSql = @'
WITH access_grants AS (
    SELECT
        'DATABASE'::text AS object_type,
        database.datname AS object_name,
        COALESCE(grantee.rolname, 'PUBLIC') AS grantee_name,
        expanded.privilege_type,
        expanded.is_grantable
    FROM pg_database AS database
    CROSS JOIN LATERAL aclexplode(database.datacl) AS expanded
    LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
    WHERE database.datname = current_database()
      AND (
          expanded.grantee = 0
          OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
      )

    UNION ALL

    SELECT
        'SCHEMA',
        schema.nspname,
        COALESCE(grantee.rolname, 'PUBLIC'),
        expanded.privilege_type,
        expanded.is_grantable
    FROM pg_namespace AS schema
    CROSS JOIN LATERAL aclexplode(schema.nspacl) AS expanded
    LEFT JOIN pg_roles AS grantee ON grantee.oid = expanded.grantee
    WHERE schema.nspname = 'public'
      AND (
          expanded.grantee = 0
          OR grantee.rolname IN ('mycaresight_app', 'mycaresight_jobs')
      )
)
SELECT concat_ws(
    '|',
    object_type,
    object_name,
    grantee_name,
    privilege_type,
    is_grantable::text
)
FROM access_grants
ORDER BY object_type, object_name, grantee_name, privilege_type, is_grantable;
'@

$roleMembershipSql = @'
SELECT concat_ws(
    '|',
    granted_role.rolname,
    member_role.rolname,
    membership.admin_option::text,
    membership.inherit_option::text,
    membership.set_option::text
)
FROM pg_auth_members AS membership
JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles AS member_role ON member_role.oid = membership.member
WHERE granted_role.rolname IN ('mycaresight_app', 'mycaresight_jobs')
   OR member_role.rolname IN ('mycaresight_app', 'mycaresight_jobs')
ORDER BY granted_role.rolname, member_role.rolname;
'@

$sourceUrl = Read-SecretText 'Paste the OLD US East 2 UAT direct owner connection string'
$targetUrl = Read-SecretText 'Paste the NEW US West 2 UAT direct owner connection string'

$source = ConvertFrom-PgUrl -ConnectionString $sourceUrl
$target = ConvertFrom-PgUrl -ConnectionString $targetUrl
$sourceUrl = $null
$targetUrl = $null

if ($source.Host -notmatch 'us-east-2') {
    throw 'The source does not appear to be the old US East 2 database.'
}

if ($target.Host -notmatch 'us-west-2') {
    throw 'The target does not appear to be the new US West 2 database.'
}

$pooledConnections = @()
if ($source.Host -match 'pooler') {
    $pooledConnections += 'OLD source'
}
if ($target.Host -match 'pooler') {
    $pooledConnections += 'NEW target'
}
if ($pooledConnections.Count -gt 0) {
    throw "Use direct connections for this validation. Pooled URL detected for: $($pooledConnections -join ', ')."
}

try {
    $checks = @(
        [pscustomobject]@{
            Name = 'Extensions'
            Source = @(Invoke-PgQuery -Connection $source -Sql $extensionSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $extensionSql)
        }
        [pscustomobject]@{
            Name = 'Schema object counts'
            Source = @(Invoke-PgQuery -Connection $source -Sql $catalogSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $catalogSql)
        }
        [pscustomobject]@{
            Name = 'Sequence states'
            Source = @(Invoke-PgQuery -Connection $source -Sql $sequenceSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $sequenceSql)
        }
        [pscustomobject]@{
            Name = 'Per-table row counts'
            Source = @(Invoke-PgQuery -Connection $source -Sql $tableCountSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $tableCountSql)
        }
        [pscustomobject]@{
            Name = 'Restricted runtime roles'
            Source = @(Invoke-PgQuery -Connection $source -Sql $roleSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $roleSql)
        }
        [pscustomobject]@{
            Name = 'RLS table settings'
            Source = @(Invoke-PgQuery -Connection $source -Sql $rlsSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $rlsSql)
        }
        [pscustomobject]@{
            Name = 'RLS policy definitions'
            Source = @(Invoke-PgQuery -Connection $source -Sql $policySql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $policySql)
        }
        [pscustomobject]@{
            Name = 'Table and sequence grants'
            Source = @(Invoke-PgQuery -Connection $source -Sql $relationGrantSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $relationGrantSql)
        }
        [pscustomobject]@{
            Name = 'Column grants'
            Source = @(Invoke-PgQuery -Connection $source -Sql $columnGrantSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $columnGrantSql)
        }
        [pscustomobject]@{
            Name = 'Function grants'
            Source = @(Invoke-PgQuery -Connection $source -Sql $functionGrantSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $functionGrantSql)
        }
        [pscustomobject]@{
            Name = 'Default grants'
            Source = @(Invoke-PgQuery -Connection $source -Sql $defaultGrantSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $defaultGrantSql)
        }
        [pscustomobject]@{
            Name = 'Database and schema grants'
            Source = @(Invoke-PgQuery -Connection $source -Sql $databaseAndSchemaGrantSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $databaseAndSchemaGrantSql)
        }
        [pscustomobject]@{
            Name = 'Runtime role memberships'
            Source = @(Invoke-PgQuery -Connection $source -Sql $roleMembershipSql)
            Target = @(Invoke-PgQuery -Connection $target -Sql $roleMembershipSql)
        }
    )

    $failed = $false

    foreach ($check in $checks) {
        $difference = @(
            Compare-Object `
                -ReferenceObject $check.Source `
                -DifferenceObject $check.Target
        )

        if ($difference.Count -eq 0) {
            Write-Host "PASS: $($check.Name)"
        }
        else {
            $failed = $true
            Write-Host "FAIL: $($check.Name)"
            $difference | Format-Table -AutoSize
        }
    }

    if ($failed) {
        throw 'DATABASE_COPY_VALIDATION_FAILED'
    }

    Write-Host ''
    Write-Host 'DATABASE_COPY_VALIDATION_PASSED'
}
finally {
    Clear-PgEnvironment
    $source.Password = $null
    $target.Password = $null
}
