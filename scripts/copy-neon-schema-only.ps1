param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'

$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
$psql = Join-Path $PostgresBin 'psql.exe'

foreach ($tool in @($pgDump, $pgRestore, $psql)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "Required PostgreSQL tool was not found: $tool"
    }
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

function Set-PgEnvironment {
    param([Parameter(Mandatory)]$Connection)

    $env:PGPASSWORD = $Connection.Password
    $env:PGSSLMODE = 'require'
    $env:PGCHANNELBINDING = 'require'
}

function Invoke-NativeCapture {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    # Windows PowerShell can promote native stderr to a terminating ErrorRecord
    # before the process exit code can be checked. Capture both streams and make
    # the exit code authoritative instead.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& $Path @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output | ForEach-Object { $_.ToString() })
    }
}

function Invoke-PgScalar {
    param(
        [Parameter(Mandatory)]$Connection,
        [Parameter(Mandatory)][string]$Sql
    )

    Set-PgEnvironment -Connection $Connection
    try {
        $result = Invoke-NativeCapture -Path $psql -Arguments @(
            "--host=$($Connection.Host)",
            "--port=$($Connection.Port)",
            "--username=$($Connection.User)",
            "--dbname=$($Connection.Database)",
            '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', $Sql
        )

        if ($result.ExitCode -ne 0) {
            throw "PostgreSQL query failed against $($Connection.Host): $($result.Output -join [Environment]::NewLine)"
        }

        ($result.Output -join [Environment]::NewLine).Trim()
    }
    finally {
        Clear-PgEnvironment
    }
}

function Invoke-SchemaDump {
    param(
        [Parameter(Mandatory)]$Connection,
        [Parameter(Mandatory)][string]$OutputPath,
        [Parameter(Mandatory)][ValidateSet('custom', 'plain')][string]$Format,
        [switch]$NoPrivileges
    )

    Set-PgEnvironment -Connection $Connection
    try {
        $arguments = @(
            "--host=$($Connection.Host)",
            "--port=$($Connection.Port)",
            "--username=$($Connection.User)",
            "--dbname=$($Connection.Database)",
            "--format=$Format",
            '--schema-only',
            '--no-owner',
            "--file=$OutputPath"
        )
        if ($NoPrivileges) {
            $arguments += '--no-privileges'
        }
        $result = Invoke-NativeCapture -Path $pgDump -Arguments $arguments

        if ($result.ExitCode -ne 0) {
            throw "Schema dump failed for $($Connection.Host): $($result.Output -join [Environment]::NewLine)"
        }
    }
    finally {
        Clear-PgEnvironment
    }
}

function Get-NormalizedSchemaDump {
    param([Parameter(Mandatory)][string]$Path)

    @(
        Get-Content -LiteralPath $Path | Where-Object {
            $_ -notmatch '^\\(un)?restrict ' -and
            $_ -notmatch '^-- Dumped from database version ' -and
            $_ -notmatch '^-- Dumped by pg_dump version ' -and
            $_ -notmatch '^ALTER DEFAULT PRIVILEGES\b.*\b(cloud_admin|neon_superuser)\b' -and
            $_ -notmatch '^(GRANT|REVOKE)\b.*\b(cloud_admin|neon_superuser)\b'
        }
    )
}

$sourceUrl = Read-SecretText 'Paste the Development DIRECT owner connection string'
$targetUrl = Read-SecretText 'Paste the environment-base DIRECT owner connection string'

$source = ConvertFrom-PgUrl -ConnectionString $sourceUrl
$target = ConvertFrom-PgUrl -ConnectionString $targetUrl
$sourceUrl = $null
$targetUrl = $null

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("mycaresight-schema-{0}" -f [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $tempRoot 'schema.dump'
$restoreListPath = Join-Path $tempRoot 'restore.list'
$sourceSqlPath = Join-Path $tempRoot 'source.sql'
$targetSqlPath = Join-Path $tempRoot 'target.sql'

$tableCountSql = @'
SELECT count(*)
FROM pg_class AS relation
JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
WHERE schema.nspname = 'public'
  AND relation.relkind IN ('r', 'p');
'@

$targetEmptySql = @'
DO $validation$
DECLARE
    item record;
    row_count bigint;
BEGIN
    FOR item IN
        SELECT schema.nspname AS schema_name, relation.relname AS table_name
        FROM pg_class AS relation
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        WHERE schema.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
    LOOP
        EXECUTE format('SELECT count(*) FROM %I.%I', item.schema_name, item.table_name)
        INTO row_count;

        IF row_count <> 0 THEN
            RAISE EXCEPTION 'Target table %.% contains % rows', item.schema_name, item.table_name, row_count;
        END IF;
    END LOOP;
END
$validation$;

SELECT true;
'@

$runtimeGrantSql = @'
SELECT
    has_schema_privilege('mycaresight_app', 'public', 'USAGE')
    AND has_table_privilege('mycaresight_app', 'public.applications', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('mycaresight_app', 'public.background_job_runs', 'SELECT')
    AND has_schema_privilege('mycaresight_jobs', 'public', 'USAGE')
    AND has_table_privilege('mycaresight_jobs', 'public.background_job_runs', 'SELECT,INSERT,UPDATE')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.background_job_runs', 'DELETE')
    AND has_column_privilege('mycaresight_jobs', 'public.notifications', 'id', 'SELECT')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.notifications', 'SELECT')
    AND NOT has_column_privilege('mycaresight_jobs', 'public.user_profiles', 'password_hash', 'SELECT')
    AND NOT has_table_privilege('mycaresight_jobs', 'public.lead_integration_credentials', 'SELECT');
'@

try {
    foreach ($connection in @($source, $target)) {
        if ($connection.Host -match 'pooler') {
            throw "Use a direct Neon connection, not a pooled URL: $($connection.Host)"
        }

        if ($connection.User -ne 'neondb_owner') {
            throw "Use the neondb_owner connection for schema copy; received '$($connection.User)'."
        }

        if ($connection.Database -ne 'neondb') {
            throw "Expected database 'neondb'; received '$($connection.Database)'."
        }
    }

    if ($source.Host -eq $target.Host) {
        throw 'Source and target resolve to the same Neon endpoint.'
    }

    $sourceTableCount = [int](Invoke-PgScalar -Connection $source -Sql $tableCountSql)
    $targetTableCount = [int](Invoke-PgScalar -Connection $target -Sql $tableCountSql)

    if ($sourceTableCount -eq 0) {
        throw 'The Development source has no public tables to copy.'
    }

    if ($targetTableCount -ne 0) {
        throw "The environment-base target already contains $targetTableCount public tables. This script only restores into an empty target."
    }

    $runtimeRoleCount = [int](Invoke-PgScalar -Connection $target -Sql "SELECT count(*) FROM pg_roles WHERE rolname IN ('mycaresight_app', 'mycaresight_jobs');")
    if ($runtimeRoleCount -ne 2) {
        throw 'environment-base must contain both mycaresight_app and mycaresight_jobs before restoring schema grants.'
    }

    New-Item -ItemType Directory -Path $tempRoot | Out-Null

    Write-Host 'Creating a schema-only Development backup...'
    Invoke-SchemaDump -Connection $source -OutputPath $archivePath -Format custom

    $listResult = Invoke-NativeCapture -Path $pgRestore -Arguments @('--list', $archivePath)
    if ($listResult.ExitCode -ne 0) {
        throw "Could not inspect the schema archive: $($listResult.Output -join [Environment]::NewLine)"
    }

    $skippedPlatformAclCount = 0
    $filteredRestoreList = @(
        foreach ($line in $listResult.Output) {
            if ($line -match ';\s+\d+\s+\d+\s+(?:DEFAULT )?ACL\b.*\s(?:cloud_admin|neon_superuser)$') {
                $skippedPlatformAclCount++
                "; $line"
            }
            else {
                $line
            }
        }
    )
    [IO.File]::WriteAllLines(
        $restoreListPath,
        [string[]]$filteredRestoreList,
        (New-Object Text.UTF8Encoding($false))
    )

    if ($skippedPlatformAclCount -gt 0) {
        Write-Host "Omitting $skippedPlatformAclCount Neon-managed ACL entries that neondb_owner cannot replay."
    }

    Write-Host 'Restoring schema into environment-base in one transaction...'
    Set-PgEnvironment -Connection $target
    try {
        $restoreResult = Invoke-NativeCapture -Path $pgRestore -Arguments @(
            "--host=$($target.Host)",
            "--port=$($target.Port)",
            "--username=$($target.User)",
            "--dbname=$($target.Database)",
            '--no-owner',
            '--single-transaction',
            '--exit-on-error',
            "--use-list=$restoreListPath",
            $archivePath
        )

        if ($restoreResult.ExitCode -ne 0) {
            throw "Schema restore failed: $($restoreResult.Output -join [Environment]::NewLine)"
        }
    }
    finally {
        Clear-PgEnvironment
    }

    $restoredTableCount = [int](Invoke-PgScalar -Connection $target -Sql $tableCountSql)
    if ($restoredTableCount -ne $sourceTableCount) {
        throw "Table-count mismatch. Development has $sourceTableCount tables; environment-base has $restoredTableCount."
    }

    if ((Invoke-PgScalar -Connection $target -Sql $targetEmptySql) -ne 't') {
        throw 'The target empty-table validation did not return the expected result.'
    }

    if ((Invoke-PgScalar -Connection $target -Sql $runtimeGrantSql) -ne 't') {
        throw 'The restored application and jobs runtime grants do not match the expected access boundary.'
    }

    Invoke-SchemaDump -Connection $source -OutputPath $sourceSqlPath -Format plain -NoPrivileges
    Invoke-SchemaDump -Connection $target -OutputPath $targetSqlPath -Format plain -NoPrivileges

    $schemaDifference = @(
        Compare-Object `
            -ReferenceObject (Get-NormalizedSchemaDump -Path $sourceSqlPath) `
            -DifferenceObject (Get-NormalizedSchemaDump -Path $targetSqlPath)
    )

    if ($schemaDifference.Count -ne 0) {
        $preview = ($schemaDifference | Select-Object -First 20 | Out-String).Trim()
        throw "Schema definitions differ after restore. First differences:`n$preview"
    }

    Write-Host 'PASS: Schema definitions match Development'
    Write-Host "PASS: $restoredTableCount public tables contain zero rows"
    Write-Host 'PASS: Application and jobs runtime grants are preserved'
    Write-Host 'PASS: No application data was copied'
    Write-Host ''
    Write-Host 'ENVIRONMENT_BASE_SCHEMA_COPY_PASSED'
}
finally {
    Clear-PgEnvironment
    if ($null -ne $source) { $source.Password = $null }
    if ($null -ne $target) { $target.Password = $null }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
