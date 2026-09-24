# UAT agency caregiver dashboard reads

Prepared 2026-09-23 for local Dev and Azure UAT. This is an application-only change and requires no database migration.

## Live evidence

The live Supabase source and Neon Dev/UAT schemas were inspected for the caregiver member and credential columns used by this read model. The three environments agree on `caregiver_members.id`, `agency_id`, `status`, and `created_at`, and on `caregiver_credentials.id`, `agency_id`, `expiration_date`, `status`, and `created_at`. No application records were read.

The old Supabase dashboard query filtered `caregiver_credentials.days_until_expiry`, but that column does not exist in the source or either target. The existing staff-license mapper already derives days remaining from `expiration_date`; the new aggregate now uses the same real date column.

## Change

Both agency caregiver dashboard entry points now load total staff, active staff, and credentials expiring in the next 30 days through `readAgencyCaregiverDashboardStats`. The repository reloads the current active company owner or care coordinator and matching active membership, rejects a mismatched caller-supplied agency, scopes every count to that agency, and commits an identifier-only read audit before returning results.

The two pages no longer construct a Supabase server client. The legacy Neon query-folder name remains a cleanup concern and does not indicate that these converted counts call Supabase.

## Validation and limits

Three PGlite tests cover correct agency totals, foreign-agency denial, invited-membership denial, and failure closed when the audit cannot be committed. All 169 tests across 15 suites, TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass. Existing React Hook and stale Browserslist warnings remain.

The broader caregiver list, pay-rate, and credential reads already execute against Neon, but their legacy query exports remain to be consolidated into application-owned repositories. Live UAT workflow acceptance remains pending. No remote write, production access, deployment, or PHI access occurred.
