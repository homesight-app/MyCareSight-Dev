# UAT Server Page Read Cutover

Status: local code complete; no database migration required for this slice.

## Scope

This slice removes direct Supabase server-client reads from eight platform and agency pages:

- admin and expert client dashboards;
- admin lead and program detail reference lookups;
- admin expert email lookup;
- expert program playbook lookup;
- agency patient-lead detail authorization and audit;
- agency lead-pipeline stage counts.

The reads now use `platform-application-dashboard.ts` and `agency-lead-reads.ts` under the application-owned, server-only repository boundary. The repositories reload the current active profile from Neon. Agency lead reads also require a matching active `company_owner` or `care_coordinator` membership and verified agency ownership. Expert program lookup requires the application to be assigned to the current expert. Admin-only reads reject every other role.

## Live schema evidence

Read-only metadata inspection on 2026-09-23 confirmed the columns used by this slice on live Supabase, Neon Dev (`br-bitter-dust-axfgiziy`), and Neon UAT (`br-empty-mouse-axnk8fbc`). The inspected tables were `applications`, `agency_admins`, `user_profiles`, `configuration_values`, `playbook_items`, `leads`, and `audit_log`. No application rows were queried.

## Security and audit behavior

Every repository operation derives the actor from the server session and current Neon profile. Client-supplied actor identity, role, and agency are not accepted as authority. Lead reads verify `lead_type = 'patient'` and agency ownership. Read audits contain identifiers and operation names only; they exclude names, email values, lead content, and other record content. Audit failure suppresses the requested result.

## Validation

Focused PGlite tests cover active-role checks, expert assignment, agency membership, cross-agency rejection, result scoping, and fail-closed audit behavior. The complete 178-test/17-suite run, TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass. The build retains pre-existing React Hook and stale Browserslist warnings.

## Remaining work

The agency landing page still has the final direct Supabase server-client import for notifications. Notification reads and mutations already have several Neon implementations, but their server actions still accept caller-supplied user identifiers and Neon Dev/UAT currently expose the table to the runtime role without RLS. Treat notifications as one lifecycle slice: replace those action boundaries, add user-owned RLS and scoped grants, then remove the landing-page client and the Realtime subscription.
