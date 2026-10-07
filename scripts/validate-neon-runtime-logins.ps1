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

function Test-RuntimeLogin {
    param(
        [Parameter(Mandatory)][string]$HostName,
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][string]$Database,
        [Parameter(Mandatory)][string]$RoleName,
        [Parameter(Mandatory)][string]$Password,
        [Parameter(Mandatory)][string]$PermissionSql
    )

    $env:PGPASSWORD = $Password
    $env:PGSSLMODE = 'require'
    $env:PGCHANNELBINDING = 'require'

    try {
        $identityOutput = @(
            & $psql `
                "--host=$HostName" `
                "--port=$Port" `
                "--username=$RoleName" `
                "--dbname=$Database" `
                -X -w -qAt -v ON_ERROR_STOP=1 `
                -c 'SELECT current_user;' 2>&1
        )
        $identityExitCode = $LASTEXITCODE
        $identity = (($identityOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()

        if ($identityExitCode -ne 0) {
            throw "Connection or authentication failed for $RoleName (psql exit code $identityExitCode): $identity"
        }

        if ($identity -ne $RoleName) {
            throw "Expected database identity $RoleName but received '$identity'."
        }

        $permissionOutput = @(
            & $psql `
                "--host=$HostName" `
                "--port=$Port" `
                "--username=$RoleName" `
                "--dbname=$Database" `
                -X -w -qAt -v ON_ERROR_STOP=1 `
                -c $PermissionSql 2>&1
        )
        $permissionExitCode = $LASTEXITCODE
        $permissionResult = (($permissionOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()

        if ($permissionExitCode -ne 0) {
            throw "Permission query failed for $RoleName (psql exit code $permissionExitCode)."
        }

        if ($permissionResult -ne 't') {
            throw "Effective-permission validation failed for $RoleName; query returned '$permissionResult'."
        }

        Write-Host "PASS: $RoleName pooled login and effective permissions"
    }
    finally {
        Clear-PgEnvironment
    }
}

$appPermissionSql = @'
SELECT
    current_user = 'mycaresight_app'
    AND EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = current_user
          AND rolcanlogin
          AND NOT rolsuper
          AND NOT rolcreatedb
          AND NOT rolcreaterole
          AND NOT rolinherit
          AND NOT rolbypassrls
    )
    AND has_database_privilege(current_user, current_database(), 'CONNECT')
    AND has_schema_privilege(current_user, 'public', 'USAGE')
    AND has_table_privilege(current_user, 'public.user_profiles', 'SELECT')
    AND NOT has_table_privilege(current_user, 'public.background_job_runs', 'SELECT')
    AND NOT has_table_privilege(current_user, 'public.background_job_items', 'SELECT')
    AND NOT has_table_privilege(current_user, 'public.background_job_outbox', 'SELECT');
'@

$jobsPermissionSql = @'
SELECT
    current_user = 'mycaresight_jobs'
    AND EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = current_user
          AND rolcanlogin
          AND NOT rolsuper
          AND NOT rolcreatedb
          AND NOT rolcreaterole
          AND NOT rolinherit
          AND NOT rolbypassrls
    )
    AND has_database_privilege(current_user, current_database(), 'CONNECT')
    AND has_schema_privilege(current_user, 'public', 'USAGE')
    AND has_table_privilege(
        current_user,
        'public.background_job_runs',
        'SELECT,INSERT,UPDATE'
    )
    AND NOT has_table_privilege(
        current_user,
        'public.background_job_runs',
        'DELETE'
    )
    AND has_table_privilege(
        current_user,
        'public.background_job_items',
        'SELECT,INSERT,UPDATE'
    )
    AND NOT has_table_privilege(
        current_user,
        'public.background_job_items',
        'DELETE'
    )
    AND has_table_privilege(
        current_user,
        'public.background_job_outbox',
        'SELECT,INSERT,UPDATE'
    )
    AND NOT has_table_privilege(
        current_user,
        'public.background_job_outbox',
        'DELETE'
    )
    AND has_column_privilege(
        current_user,
        'public.notifications',
        'id',
        'SELECT'
    )
    AND NOT has_table_privilege(
        current_user,
        'public.notifications',
        'SELECT'
    )
    AND NOT has_column_privilege(
        current_user,
        'public.user_profiles',
        'password_hash',
        'SELECT'
    )
    AND NOT has_table_privilege(
        current_user,
        'public.lead_integration_credentials',
        'SELECT'
    );
'@

$appUrl = Read-SecretText 'Paste the complete NEW UAT mycaresight_app pooled connection string'
$jobsUrl = Read-SecretText 'Paste the complete NEW UAT mycaresight_jobs pooled connection string'

$appConnection = ConvertFrom-PgUrl -ConnectionString $appUrl
$jobsConnection = ConvertFrom-PgUrl -ConnectionString $jobsUrl
$appUrl = $null
$jobsUrl = $null

if ($appConnection.User -ne 'mycaresight_app') {
    throw "The application URL uses role '$($appConnection.User)' instead of mycaresight_app."
}

if ($jobsConnection.User -ne 'mycaresight_jobs') {
    throw "The jobs URL uses role '$($jobsConnection.User)' instead of mycaresight_jobs."
}

foreach ($connection in @($appConnection, $jobsConnection)) {
    if ($connection.Host -notmatch 'us-west-2') {
        throw "The hostname for $($connection.User) is not the new US West 2 endpoint."
    }

    if ($connection.Host -notmatch 'pooler') {
        throw "The connection for $($connection.User) is not using the pooled endpoint."
    }

    if ($connection.Database -ne 'neondb') {
        throw "The connection for $($connection.User) uses database '$($connection.Database)' instead of neondb."
    }
}

if ($appConnection.Host -ne $jobsConnection.Host) {
    throw 'The application and jobs URLs do not use the same target endpoint.'
}

try {
    Test-RuntimeLogin `
        -HostName $appConnection.Host `
        -Port $appConnection.Port `
        -Database $appConnection.Database `
        -RoleName 'mycaresight_app' `
        -Password $appConnection.Password `
        -PermissionSql $appPermissionSql

    Test-RuntimeLogin `
        -HostName $jobsConnection.Host `
        -Port $jobsConnection.Port `
        -Database $jobsConnection.Database `
        -RoleName 'mycaresight_jobs' `
        -Password $jobsConnection.Password `
        -PermissionSql $jobsPermissionSql

    Write-Host ''
    Write-Host 'RUNTIME_LOGIN_VALIDATION_PASSED'
}
finally {
    Clear-PgEnvironment
    $appConnection.Password = $null
    $jobsConnection.Password = $null
}
