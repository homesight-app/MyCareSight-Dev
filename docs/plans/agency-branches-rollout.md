# Agency branches: two-phase delivery and operator rollout

Updated: 2026-11-25. Local branch: `feature/agency-branches`, based on `main` at `9efb738`.
The user explicitly authorized development after confirming the migration fixes work.
No push, remote merge, deployment, live schema query or database execution is authorized for the agent.

## Phase 1: agency-administrator onboarding

- Configuration opens Agency Info for agency owners. The existing company editor is moved out of personal Profile, with shared validation, current owner/membership authorization and transactional audit. Existing legal/onboarding fields absent from that form are preserved. The old action delegates to the same boundary for previously opened profile tabs.
- Configuration → Agency Info → Branches supports adding/editing offices, contact/address/timezone details, changing the default and activating/deactivating unused branches. The admin agency record exposes the same lazy Branches tab. Agency creation creates Main Branch. Existing agencies receive Main Branch with a one-time copy of their existing physical address. Existing leads/clients and agency program applications retain their IDs and receive that default.
- Agency-owned leads and clients have one current branch. New records use the agency default, independently of a list filter. Change assignments through the record's Branches control. Platform sales leads with no agency remain branchless.
- Lead-to-client conversion preserves the lead's selected branch. Existing visits are never moved. Phase 1 rejects branch transfers for clients that already have visits; Phase 2 must introduce historical attribution and the reviewed transfer workflow first.
- The HomeSights Services page program-request entry reuses the existing shared catalog and review modal. Other legacy creation entry points receive the default branch and can edit associations afterward. Owners select one or several branches before submitting. One application, workflow and common document set is created atomically. Request IDs make retries from the same review form idempotent. Existing enrolled programs can change associations through their detail page. Association does not establish legal license coverage for another office/state.
- Agency administrators retain all-branch visibility. The user explicitly confirms coordinator branch restrictions are Phase 2. Existing coordinators retain their current agency-wide permissions; agency-portal branch management/assignment controls remain owner-only. Platform administrators can manage branch setup from an explicitly scoped admin agency record, with fresh active-role checks on every request. There is no branch-level isolation claim in Phase 1. Storage, documents, exports, caches and existing child workflows retain agency-level authorization.
- Agency-facing Branding is removed from Configuration; existing assets, runtime appearance and platform branding are preserved.

Agency Info contains agency-level legal/business and mailing addresses. Each office's address is maintained under Branches. Editing one does not silently update the other. Default backfilled timezones are `UTC` until the administrator reviews the office timezone; timezone is not inferred from an incomplete address and does not establish payroll or scheduling rules.

Existing Work Schedule, Pay Rules, Mileage and Lead Pipeline behavior remains agency-wide. Their data now loads only when opened, without blocking Agency Info or branch setup. Their existing legacy form/server schemas remain separate; consolidating those policy schemas and introducing branch overrides is outside this batch. The new branch and relocated Agency Info forms use shared Zod schemas, React Hook Form, inline field errors and guarded server mutations. Required agency text is trimmed so whitespace cannot satisfy a required field. Agency Info requires an already provisioned agency and active owner membership; it does not create agencies or activate pending owners from personal Profile.

### November 25: automatic codes and shared state selection

The branch primary key is its UUID; leads, clients and enrolled programs reference that UUID. The separate code is used for display/search/stable ordering. New office codes are generated on the server as `br-` plus a random UUID without hyphens; they are never accepted from the form or a submitted payload. Editing a branch preserves its existing code. Duplicate names are allowed. Existing automatically created `main` codes remain intact. The independent `is_default` flag can move to another active branch without renaming it, changing either identifier or rewriting existing record assignments. Code is shown as read-only text after creation, not a required user field.

The new reusable `StateSelect` uses the existing `US_STATES` list, now derived from one alphabetical name/abbreviation catalog without changing the list's 50 names or its string-array API. Branch addresses and Agency Info physical/mailing addresses use that component. Legacy names/abbreviations normalize to the same full names on form load and validated save; unknown values stay visible for correction and are rejected by active address validation. Hidden, unused mailing fields do not block a same-as-physical save. Unrelated forms/catalog jurisdiction behavior has not been rewritten. These changes require no new SQL or reapplication of the foundation.

### November 25: shared agency overview and deferred branch table

- Agency Info now starts with a read-only summary using `AgencySummaryCard`, extracted from the existing admin agency view while preserving its fields, labels and link behavior. The owner overview adds existing license/mailing details and an Edit Agency Info action. The existing validated editor loads only when requested and supports Cancel; no second form or admin organization-save path is introduced.
- Configuration streams one authorized agency projection through a server Suspense boundary. It no longer waits for client component download and a subsequent read action to display the agency. The sidebar can render while the read resolves. A safe local Retry handles a failed server read without automatically repeating it. Membership checks and identifier-only read auditing remain in the transaction. Redundant actor-setting SQL is skipped only when the initial verified context already matches the freshly checked profile; membership authorization is never cached or skipped.
- Branches is a tab within Agency Info; the old `?section=branches` URL still opens it. The branch bundle and data request start only on first selection. Agency Info and previously opened branch content remain mounted while changing configuration sections. The admin agency view uses the same summary and branch table and likewise defers branch work until selection. Its other existing tab preload queries are unchanged; this is not a claim that the entire admin record loader has been optimized.
- The screen uses the shared `DataTable` shell, composed from existing search, filter, button, sorting, action-menu and pagination controls. `useTableState` still owns feature query state and `StatusBadge` remains a feature cell renderer. The shell provides the toolbar, clickable rows, feedback and pagination; the existing editor and default/activation callbacks stay in Branches. Search, sort and pagination execute in SQL with stable ID ties, a 25-row page plus one-row lookahead and a matching window count. Client sorting/slicing helpers are deliberately not used for server pages.
- Per-record component memory caches at most 12 successful page/search/sort variants and deduplicates in-flight requests; no browser storage or global user cache is used. Tab re-entry and cached page navigation avoid extra reads. Refresh and successful changes invalidate this cache. Query failure remains local and retryable, and stale responses do not replace a later selection. Each actual deferred server request still authenticates, authorizes and audits independently.
- An explicit target agency ID is accepted only for branch setup and only after verifying the current profile is an active platform administrator. The target agency must exist, each record read/update stays scoped to it, and existing RLS remains enabled. Owners/coordinators cannot use that argument to cross agency boundaries. Ordinary assignment/program actions retain their existing owner checks. Existing branch RLS already permits platform-admin setup, so no SQL, grants or policy changes are needed.

Expected result size remains one agency summary and no unopened branch/editor payload, then at most 26 branch rows per request (25 displayed), under the existing 100-branch creation limit. A normal owner branch read uses three repository statements (fresh membership check, bounded read/count, audit), in addition to the existing auth/transaction boundary. The shared summary extraction does not add an admin-page database read. Actual Azure/Neon latency, cold starts, concurrent behavior and a 10x cloud benchmark have not been measured in this local review.

### Shared table foundation

The user separately approves the shared table foundation after requesting an inventory first. No generic record table existed; the new shell reuses the existing controls rather than adding a library. Only Branches adopts it in both portals. Search/filter/sort controls are configurable, pagination is required, and record/query/permission rules remain outside the shell. Branches keeps its existing server search/sort/paging behavior; no new domain filter or backend change is silently introduced. Existing tables remain on their current implementations. See [the shared table contract and consumer inventory](../../src/components/ui/TABLES.md). This does not advance the deferred personnel/care-operation phase.

## Phase 2: personnel scope and care operations

Deferred: selected/ALL coordinator scope (ALL includes future branches), caregiver and personnel associations; complete authorization/RLS/child-record/storage/export/job/cache coverage before restrictive grants are enabled; branch snapshots for visits, EVV, financial records and reports; reviewed client/future-visit transfers; and effective-dated branch work/pay/mileage overrides over agency defaults. Preserve employer-wide overtime and historical financial results. Branch-specific licensing coverage and mixed-branch financial policies require review before implementation. This phase does not start automatically.

## Schema authority and execution boundary

The user authorizes the supplied unchanged schema exports as authoritative evidence. The target baseline is the private Neon schema-only artifact, SHA-256 `a80a985285685b16e023ebdf8a0313960893f79c04d7cd8e710e84a871702a6e`. Historical source artifact SHA-256: `c4e374478a29c7b3149652e4e3dfc92f8fd5e97d60be11ee3d5b7e15795f6d97`. Neither artifact nor business rows are copied into this repository. This is offline verification of the supplied baseline, not a new live parity attestation.

Prepared manual files:

1. `scripts/manual/agency-branches/001-foundation.sql`
2. `scripts/manual/agency-branches/002-verify.sql`
3. `scripts/manual/agency-branches/003-program-link-hardening.sql` (only for an earlier foundation installation)

These are deliberately outside the managed migration manifest and CI auto-apply directory. Do not move them into automatic migration discovery. The operator must record script checksums and execution evidence separately in the release record. Preparation does not authorize production execution.

The foundation runs in one transaction as `mycaresight_schema_owner`. Transactional write/DDL locks prevent records slipping between backfill and trigger installation; lock acquisition fails after five seconds rather than waiting indefinitely. Choose a short operator-controlled schema window. It adds branch tables, same-agency foreign keys, indexed filters, default/backfill triggers, and FORCE RLS on new tables. Existing patient RLS remains enabled/FORCE throughout; a schema-owner-only backfill policy is created and removed within the transaction. No runtime DELETE privilege is granted on branches. New trigger functions do not grant PUBLIC/runtime direct execution. New policies permit active agency managers to read and active owners/platform administrators to manage the new relations; application endpoints require the current agency owner for agency workflows, or a freshly verified platform administrator for explicit agency branch setup.

One active default is enforced by a partial unique index and a deferred invariant. Default changes lock the agency row; new-default selection never rewrites existing assignments. Program associations use same-agency foreign keys and cannot be emptied at commit. Deferred checks cover both applications and association deletions; caregiver-to-agency scope changes receive a default only when no explicit association exists. The parent check uses NO KEY UPDATE to serialize integrity checks without conflicting with ordinary child foreign-key KEY SHARE locks. Deleting an application still permits its legitimate link cascade. Stable branch codes cannot be renamed through the application. Branch retirement with linked records is held, rather than deleting history. Assignment changes and program creation commit with identifier-only audit events.

## Operator sequence

1. Review the local change and scripts. Identify the development/UAT Neon project, branch and database through the operator console; use a recovery point before applying. Do not use a production connection for initial acceptance. If schema/role metadata changed after the supplied baseline, stop and reconcile that drift first.
2. Keep `AGENCY_BRANCHES_ENABLED` unset/false. Deploying code with this switch off does not query new branch tables. The Agency Info relocation, branding removal and bounded list improvements do not depend on those tables.
3. The operator runs `001-foundation.sql` on the verified development/UAT database. A failure reports only the migration stage and SQLSTATE; changes inside the block are rolled back. Issue `ROLLBACK` before retrying an aborted connection. After a connection/commit ambiguity, inspect metadata and run the verifier before rerunning. The script rejects an already-present foundation rather than layering a partial reapply.
4. Run `002-verify.sql` on the same database. Confirm database/branch identity, zero aggregate gaps, all invariant/policy booleans true, and removal of the temporary patient backfill policy. This includes `branch_triggers_valid` and `branch_foreign_keys_valid`: the verifier checks enabled trigger definitions and exact validated composite relationships, not just existing row counts. The verifier does not bypass patient FORCE RLS to count rows: validated NOT NULL and same-agency constraints establish that invariant independently of row visibility. No production row contents should be shared.
5. Only after verification, the operator sets `AGENCY_BRANCHES_ENABLED=true` on the development/UAT app and applies/restarts that app's configuration. The switch is server-only; do not use a `NEXT_PUBLIC_` variable. No credentials belong in Git.
6. Complete synthetic acceptance below, then review a release candidate. Production recovery, manual schema application, deployment and enablement are separate operator-controlled steps after UAT acceptance. No agent pushes or merges this branch.

If an earlier copy of `001-foundation.sql` was already installed, do not rerun it. Keep the feature disabled and use `003-program-link-hardening.sql`, then the updated `002-verify.sql`. The patch briefly locks applications and their branch links, refreshes the program triggers atomically and preserves all existing assignments. It stops at `program-links-review` if existing agency applications lack links; the operator must review those mappings rather than letting the patch guess or backfill them. Fresh installations using the current `001` already contain this hardening and need only `001` then `002`. No script has been applied by the agent.

## Synthetic acceptance

- Create an agency through its existing provisioning flow: exactly one active Main Branch is created. Review timezone/address and add a second branch without entering a code. Codes are generated uniquely, remain stable on edits and default changes, and cannot be overridden by submitted values. Cross-agency IDs are rejected.
- Change the default: prior assignments stay unchanged; new agency leads, clients and requests default correctly. Default cannot be deactivated and an agency cannot commit with no default.
- Create a lead in one branch, convert it and confirm the client keeps that branch. Move a client without visits; confirm other records are unaffected. Transfers for clients with visits are held.
- Filter each list by branch, then change search/status/sort/page and use back/forward. Rows, totals and summaries remain consistent, with no duplicated programs. Clear filters before looking for a new record created in the agency default.
- Request one global catalog program for two branches: exactly one application and shared workflow, one set of request notifications, and no duplicate application on replay. Verify unavailable/inactive catalog entries and foreign/inactive branches are rejected.
- Existing pending/enrolled applications can display/change branch links. A later application metadata save that repeats its agency ID must not re-add an unwanted default link.
- A caregiver-linked application becoming agency-owned receives a default without replacing explicit links. Removing all links fails at commit, including if automatic default assignment is disabled. Deleting the application itself still succeeds. The verifier flags disabled triggers and missing or weakened composite foreign keys.
- Verify another agency's IDs, revoked/invited/pending memberships, a coordinator's attempted write and an audit write failure all fail closed. Existing coordinator agency-wide reads remain unchanged.
- Verify Agency Info saves the same displayed fields and preserves other legal/onboarding values. Existing Work/Pay/Mileage settings retain their stored values when opened; unopened settings and branch controls issue no data request. Personal Profile retains its personal/account workflow and links to Configuration.
- Verify the branch and both Agency Info state fields are dropdowns. Existing abbreviations select the correct full name; unknown legacy values remain visible for correction, and invalid active state values fail server validation. A separate mailing address can select a different state.
- Check keyboard navigation, inline errors, busy-state recovery, smaller screens, real deployed styling, and existing upload/download/login flows. Branch contact errors must be associated with their fields. A rejected configuration-save request restores Save, reports a safe error and retains entered values; work/pay/mileage calculations are unchanged. Fixtures and screenshots must be synthetic.

## Performance boundaries

Design targets: about 10 branches per agency, tested at 10x (100). This release explicitly caps branch creation/selectors at 100 total branches including inactive ones; exceeding an externally created inventory fails the selector rather than hiding assignments. Branch management reads 26 rows to display 25 plus a next-page indicator; ordering is stable by code and ID and search executes in SQL. Branch option loads cap at 101 to detect overflow and are fetched only when the corresponding control opens.

Lead/client/program lists retain 50-row server pages and preserve the branch filter during other URL updates. Same-agency branch indexes support lead/client predicates; application filtering uses indexed EXISTS, avoiding row/progress multiplication. Lead counts are grouped in SQL rather than loading every lead. Program progress is aggregated only for the selected page and returns fixed-size count summaries rather than all checklist rows. The pending-request preview is bounded at 50 with an explicit overflow notice; older requests remain accessible in the main paginated list. Existing global catalog selection patterns are reused, not rewritten.

The shared state dropdown renders a fixed 50-state local list and adds no database request. Code generation occurs in the existing authorized creation transaction; it introduces no extra query or unbounded scan. Existing branch/list bounds remain unchanged.

No 10x live load benchmark was run. The synthetic SQL tests exercise filtering, count/progress consistency and pagination; actual cloud latency, query plans, deployment configuration and concurrent production behavior remain UAT/operator checks.

## Rollback and risks

Disable `AGENCY_BRANCHES_ENABLED` to remove branch-dependent controls/queries; retain the additive schema and assignments. Code rollback can run against the additive schema because inserts receive defaults from triggers. Do not drop branch tables/columns once assignments exist. A destructive schema rollback would require a separate reviewed export/recovery plan. The scheduled-client transfer guard must remain until Phase 2 has a replacement that preserves history.

New foreign keys intentionally prevent deleting a referenced agency/branch and moving linked programs to another tenant. Review any operator-only destructive maintenance before rollout. Full runtime compatibility, schema parity, managed-identity behavior and deployed browser acceptance are not established by offline tests. This implementation does not itself complete HIPAA infrastructure/BAA gates or enable new care-operation capabilities.

## Validation evidence

Local validation completed on November 24:

- Second-review full Jest suite: **124 suites, 743 tests passed**. Tests used an unusable local database URL and synthetic configuration. PostgreSQL/RLS coverage executes the manual migration, optional upgrade and verifier in PGlite with synthetic schemas, roles and records; no live database is involved. Includes current membership/RLS denial, transactional audit rollback, new agency/default behavior, actual lead conversion preserving a non-default branch, full-name state compatibility, program replay, same-agency filtering, bounded pagination and SQL progress/count consistency. New regressions reproduce and close the original missing parent invariant, caregiver scope-transition default and verifier-definition gaps; they also cover repeated upgrade, review-required gaps, preserved legal fields, feature-off reads before installation, rejected settings saves and accessible contact errors. PGlite does not establish concurrent cloud PostgreSQL behavior.
- Isolated Chromium: **3 tests passed** using `playwright.agency-branches.config.ts`. Actual React components exercise keyboard assignment, accessible validation, and one program request with two branches. Every network request is intercepted; there is no application server, auth setup or cloud login. A synthetic form screenshot is kept only in ignored test output. The extra mailing-address label/validation and busy-modal regression cases pass in the component suite.
- `npm run typecheck`: passed on the final workspace source.
- `npm run lint`: passed, zero errors and 15 pre-existing warnings.
- Second-review isolated Next build: exited 0, compiled and generated all 77 pages using the repository's `--use-system-ca` option, synthetic configuration and no copied environment files. It reported a Windows EPERM warning when tracing the temporary dependency junction into a standalone package. This does not validate a production deployment package; the normal CI/Linux build remains required. TLS verification remained enabled. Temporary build copies/junctions were removed, without sharing or deleting the local development `.next` output or unrelated pre-existing build artifacts.
- Migration-control validation: passed with the unchanged **43 legacy files and 9 managed migrations**; new manual scripts are excluded from auto-apply. Whitespace checks pass.

Not executed: live development/UAT schema or role verification, manual cloud database execution, deployed application E2E, normal CI/Linux packaging, deployed responsive/styled visual comparison, production acceptance or a live 10x load benchmark. Those require the operator's intended environment and synthetic application accounts; no deployment or cloud/database credentials were used. Browser checks cover isolated components, not the complete hosted application.

Recommendation: **PROCEED SELECTIVELY** to the operator-controlled development/UAT sequence above. Phase 1 is locally prepared, not production-accepted. Phase 2 remains deferred.

November 25 follow-up validation for automatic codes and state dropdowns:

- Full synthetic Jest suite: **125 suites / 749 tests passed**; focused branch/state suites: **63 tests passed**. Covers generated distinct codes for same-name offices, stable codes when editing/defaulting, discarded submitted codes, current state mapping, invalid active states, separate mailing addresses and audit rollback.
- All **3 isolated Chromium checks passed**, including creation without a code field and selecting California from the shared dropdown. The synthetic screenshot reflects the updated form. No live browser requests or application credentials were used.
- TypeScript passed. Full lint passed with the same 15 pre-existing warnings and no errors; the final changed-file lint check passed without warnings.
- Isolated build exited 0, compiled and generated **77/77 pages** with synthetic configuration and no copied environment files. The temporary Windows junction still causes the documented standalone tracing EPERM warning; normal CI/Linux packaging is required. The temporary build directory was removed.
- Whitespace and migration-control checks passed; the managed manifest remains unchanged. No manual SQL was run. Existing bounds, deferred loading, rollout/rollback and unexecuted live/hosted/10x checks above remain applicable. Hosted full-workflow and styled before/after visual comparison were not run.

### Latest November 25 shared-overview/table validation

- Full synthetic suite: **126 suites / 762 tests passed**. The six focused branch/setup/state suites passed **76 tests** before the full run. Includes actual SQL/RLS platform-admin scope, owner/coordinator denial, inactive-admin denial, stable scoped sorting/counts, retained membership checks and the three-statement owner read budget. Server/client tests cover a projected summary, safe manual retry, no unopened branch/editor requests, retained tabs/configuration sections, server pagination/search/sort, cached page navigation, row editing and the admin shared view.
- All **4 isolated Chromium tests passed** with the real application CSS and intercepted local-only bundle/chunk requests. A follow-up narrow-screen run also passed: shared summary/tab keyboard use, one first-open request, no tab re-entry request, explicit Refresh, row-name keyboard editing, and no document-width overflow at 390px. Synthetic desktop/mobile screenshots were visually inspected in ignored test output. No full hosted before/after pixel baseline, screen-reader audit or portal-layout responsive acceptance is claimed.
- Final TypeScript passed. Full lint passed with the same 15 pre-existing warnings; final changed test/panel lint passed. Whitespace and migration control passed with the unchanged 43 legacy files / 9 managed migrations. No SQL scripts changed or ran.
- Isolated build exited 0 and compiled/generated **77/77 pages**. Its temporary Windows dependency junction still caused the documented standalone tracing EPERM warning; normal CI/Linux packaging remains required. Temporary build copies were removed. No live Azure/Neon timing, UAT credentials, deployed workflow run or 10x cloud benchmark was used. Apply the existing development/UAT gates; revert this code batch to roll back the view/endpoint changes while retaining schema and assignments.

### Shared DataTable foundation validation

- Inventory confirmed no generic record-table shell before implementation. Added `DataTable` by composing existing controls, with required pagination and configurable search/filter/sort/Add/Refresh/row actions. Only Branches adopts it. Its query state, authorization, backend filtering/sorting, 25-row pages and local cache are unchanged. No new domain filter, dependency or database script is introduced.
- Full synthetic suite: **127 suites / 775 tests passed**. Seven focused suites passed **89 tests**, including 13 direct shared-table/compatibility cases. Coverage includes server totals without double slicing, first/last/empty page states, disabled controls, search/filter/sort page resets, loading/error feedback, click isolation for links/inputs/buttons/portalled menus, row navigation and unchanged legacy control defaults.
- Final **33 UI tests and 5 styled Chromium checks passed**, covering keyboard sort buttons/aria-sort, pagination, filter/search controls, Add, row opening, lazy branch loading/tab caching and the existing narrow-screen check using real application CSS and intercepted local-only requests. Synthetic desktop/mobile/shared-filter screenshots were visually reviewed. Final TypeScript and lint passed (15 existing warnings, no errors); whitespace and migration-control checks passed. Hosted before/after pixel baselines, screen-reader testing and cloud/10x timing remain unexecuted.
- The isolated Next build compiled/generated **77/77 pages**, exited 0 and removed its temporary copy. Its known Windows standalone-junction EPERM warning remains; CI/Linux packaging is required. Final header-class alignment is covered by focused/browser verification rather than a repeated standalone-package build. Existing operator-controlled UAT, no-push/deployment boundaries and rollback instructions still apply.

## Changed file inventory

- `docs/hipaa/compliance-log.md`
- `docs/design/UI_DESIGN_SYSTEM.md`
- `docs/plans/agency-branches-rollout.md`
- `docs/plans/agency-multi-location.md`
- `docs/plans/deferred-initiatives.md`
- `e2e-isolated/agency-branches.browser.ts`
- `playwright.agency-branches.config.ts`
- `scripts/manual/agency-branches/001-foundation.sql`
- `scripts/manual/agency-branches/002-verify.sql`
- `scripts/manual/agency-branches/003-program-link-hardening.sql`
- `src/_tests_/agency-branch-actions.test.ts`
- `src/_tests_/agency-branch-ui.test.tsx`
- `src/_tests_/agency-branches.test.ts`
- `src/_tests_/agency-services-tenant-isolation.test.ts`
- `src/_tests_/agency-setup-performance.test.tsx`
- `src/_tests_/us-state.test.tsx`
- `src/_tests_/data-table.test.tsx`
- `src/app/actions/agencies.ts`
- `src/app/actions/agency-branches.ts`
- `src/app/actions/agency-configuration.ts`
- `src/app/actions/leads.ts`
- `src/app/pages/agency/applications/[id]/page.tsx`
- `src/app/pages/agency/clients/[id]/page.tsx`
- `src/app/pages/agency/clients/page.tsx`
- `src/app/pages/agency/configuration/page.tsx`
- `src/app/pages/agency/leads/[id]/page.tsx`
- `src/app/pages/agency/leads/page.tsx`
- `src/app/pages/agency/profile/page.tsx`
- `src/app/pages/admin/agencies/[id]/page.tsx`
- `src/app/pages/agency/programs/[applicationId]/page.tsx`
- `src/app/pages/agency/programs/page.tsx`
- `src/components/AgencyBranchFilter.tsx`
- `src/components/AgencyBranchSettings.tsx`
- `src/components/AgencyDetailContent.tsx`
- `src/components/AgencyConfigurationContent.tsx`
- `src/components/AgencyInfoLoader.tsx`
- `src/components/AgencyInfoSection.tsx`
- `src/components/AgencyInfoPanel.tsx`
- `src/components/AgencyInfoServer.tsx`
- `src/components/AgencySummaryCard.tsx`
- `src/components/AgencyProgramsContent.tsx`
- `src/components/ApplyForNewLicenseButton.tsx`
- `src/components/ClientsContent.tsx`
- `src/components/LeadsContent.tsx`
- `src/components/ProfileTabs.tsx`
- `src/components/ProgramBranchRequestForm.tsx`
- `src/components/RecordBranchAssignment.tsx`
- `src/components/ReviewPlaybookRequestModal.tsx`
- `src/components/ui/StateSelect.tsx`
- `src/components/ui/DataTable.tsx`
- `src/components/ui/SortableColumnHeader.tsx`
- `src/components/ui/TablePagination.tsx`
- `src/components/ui/TABLES.md`
- `src/lib/agency-branches.ts`
- `src/lib/constants.ts`
- `src/lib/repositories/agency-branches.ts`
- `src/lib/schemas/agency-branches.ts`
- `src/lib/schemas/profile.ts`
- `src/lib/schemas/us-state.ts`
- `src/lib/supabase/query/leads.ts`
- `src/lib/supabase/query/patients.ts`
- `src/lib/supabase/query/playbooks.ts`
