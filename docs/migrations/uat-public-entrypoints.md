# UAT public and account-entrypoint database cutover

Status: local code prepared on 2026-09-23. No deployment, remote write, production access, or PHI access was performed by the agent.

The public contact route now validates input with a shared Zod schema and writes the lead plus an identifier-only audit through an application-owned PostgreSQL repository. An advisory lock serializes submissions by normalized email so concurrent requests cannot bypass the existing three-per-day limit. A committed lead remains successful if confirmation email delivery fails.

The onboarding page now resolves its agency through the existing PostgreSQL query boundary. The admin users page obtains agency-owner mappings through that same boundary. These changes remove the final non-auth uses of the Supabase admin client.

Live read-only inspection confirmed the `leads` columns used by the public route match on Supabase, Neon Dev, and Neon UAT. Focused tests cover insert/audit atomicity, fourth-request rate limiting, and audit rollback. Public contact acceptance and synthetic onboarding/admin-user acceptance remain pending in Dev/UAT.
