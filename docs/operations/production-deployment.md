# Manual Production Deployment

The production application is released manually from the GitHub Actions workflow **Manual production deployment**. The workflow does not run on pushes and must not be run before the production data-cutover gate is approved.

## Release boundary

- Source repository: `homesight-app/MyCareSight-Dev`
- Allowed branch: `main`
- GitHub environment: `Production`
- Azure target: the default production slot of `mycaresight-prod-web`
- Authentication: GitHub OIDC through the production deployment managed identity
- Required source: an exact commit SHA that already completed the manual production-staging workflow successfully

The workflow rebuilds the approved commit with Production environment values. It does not swap the staging artifact into production because Next.js public environment values are embedded during the build.

## Required environment configuration

Keep these values in the GitHub `Production` environment.

Environment secrets:

- `PRODUCTION_AUTH_SECRET`
- `PRODUCTION_DATABASE_URL`

Environment variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`
- `PRODUCTION_AUTH_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

The environment must remain restricted to `main`. Keep administrator bypass disabled. The configured wait timer is an intentional final pause before the job can access Production credentials.

## Release procedure

1. Merge the intended release to `main`.
2. Run **Manual production staging deployment** from `main`.
3. Complete the staging acceptance checklist using only synthetic data.
4. Copy the full 40-character SHA from the successful staging workflow run.
5. Open **Actions → Manual production deployment → Run workflow** on `main`.
6. Enter the exact SHA as `release_sha`.
7. Enter `DEPLOY PRODUCTION` as the confirmation text.
8. Review the environment wait period, then allow the workflow to finish.
9. Confirm the workflow's production health check succeeds before any broader acceptance testing.

The workflow fails closed when the SHA is not on `main`, the exact SHA lacks a successful manual staging deployment, Production configuration is missing or points to staging, Azure selects a different subscription, or the expected App Service cannot be resolved.

Do not put credentials, connection strings, patient data, or other PHI into workflow inputs, names, annotations, or logs.

## Rollback

Application rollback uses the same workflow with a prior commit that:

1. remains on `main`, and
2. has its own successful manual production-staging workflow run.

Enter that prior full SHA and the same confirmation text. Database recovery is a separate controlled procedure; do not use an application rollback to reverse schema or data changes. If a release includes a non-backward-compatible database change, stop and follow the database recovery/cutover plan before redeploying application code.

## Current hold point

Creating this workflow does not authorize a production release or data migration. Keep it unexecuted until production reference data, schema, custom-domain/auth URLs, monitoring, backup evidence, and the explicit cutover checklist are complete.
