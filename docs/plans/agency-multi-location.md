# Agency Branches: Two-Phase Delivery Plan

Status: Phase 1 implementation authorized on 2026-11-24 after operator confirmation that migration fixes work.
Branch: `feature/agency-branches`, based on approved `main` commit `9efb738`.
Database scripts are prepared for manual operator execution only; no push, deployment or live database access is authorized.

The November 21 stabilization hold is superseded by this explicit instruction. The detailed design below remains the broader target; implementation status and the two release boundaries are recorded in [the rollout runbook](agency-branches-rollout.md).

- **Phase 1:** agency-administrator onboarding, Agency Info, branch setup/defaults, agency lead/client branch assignments and filters, and shared enrolled HomeSights program associations. Existing coordinator agency-wide permissions remain unchanged. The user explicitly confirms coordinator branch restrictions belong in Phase 2.
- **Phase 2:** selected/ALL personnel scope (ALL includes future branches), caregiver eligibility, historical transfers, scheduling/EVV, billing/payroll/reporting attribution, and effective-dated branch policy overrides. Implementation of Phase 2 remains deferred.


This revision supersedes the October proposal, including its production-population assumptions, location terminology, source-schema instructions and conflicting assignment rules. Prior text remains available in Git history. “Branch” means an agency office/subdivision, not a Neon database branch.

## Confirmed requirements and decisions

- Each agency can have multiple branches. Its first location becomes the default branch.
- Agency-owned leads and clients have one current branch, defaulted on creation and changeable through authorized workflows.
- Caregivers, users and agency-enrolled programs can be associated with one or more branches without duplicating the underlying entity.
- Agency administrators see all branches within their existing agency permissions. Coordinators have selected branches or an explicit ALL grant.
- **Confirmed:** coordinator ALL includes both current and future branches.
- **Confirmed:** moving a client preserves existing visits; offer a separate, explicit reviewed transfer for future visits that have not started.
- **Confirmed:** program association means an agency's purchased/enrolled program, such as its license application. It does not mean the platform's shared program catalog.
- **Confirmed:** one application linked to several branches has one shared workflow, progress/approval status and common document set. Use separate applications when independent branch workflows are needed. Adding a branch does not clone progress, documents or application charges.
- **Confirmed:** every branch can browse HomeSights' offered program catalog within existing product permissions. At enrollment/request, authorized users can associate the agency's program with one or several branches. Catalog visibility does not grant enrollment-edit, application-document or clinical access. Agency administrators retain agency-wide visibility; coordinator enrollment access intersects assigned branches and existing capabilities.
- Visits, EVV, billing, payroll, reports and exports require consistent branch attribution and access rules.
- **Initial adopter scope clarified:** incoming agencies initially use leads and clients without visit scheduling. Branch setup must be available in that offering; full scheduling/EVV/finance expansion can follow later behind existing capabilities. The future design still preserves those dependencies and does not enable care operations prematurely.
- **Confirmed:** remove the agency-facing Branding section from Configuration to avoid confusing agencies. This is part of the deferred enhancement scope, not an immediate application change. Platform branding and existing runtime appearance remain separate.

Example: a catalog definition “Florida Homemaker Companion License” describes the available program. ABC Agency's application for it has its own status, playbook progress and documents. That agency-owned application can be associated with Tampa and Orlando branches. Association alone does not establish that a legal license covers both offices; branch-specific approvals remain a separate business rule to verify.

## Design review

**Technical Architect:**

- Preserve `agency_id` as the tenant boundary; branches narrow access inside it.
- Use a single current branch for leads/clients, typed association tables for shared resources, and persisted visit/financial attribution for history.
- Extend existing server authorization, transaction actor context, RLS, storage authorization, sessions, audit and cache boundaries. UI filters never grant permission.
- Enforce same-agency relationships and atomic default selection. Use additive migrations and staged enforcement rather than replacing existing records.
- Keep reads bounded, indexed and deduplicated. Many-to-many joins must not multiply visits, notifications, hours or money.

**Business Analyst:**

- Keep single-branch agencies simple through defaults; require explicit selection only when necessary.
- Make ALL permission explicit, including its future-branch effect, and distinguish it from an “all permitted branches” display filter.
- Treat client transfer, in-progress care, historical records and branch retirement as controlled workflows.
- Share enrolled-program identity while preserving branch-specific licensing, documents and operational eligibility where required.
- Release in small slices after stabilization, with complete access coverage before activating branch-restricted users.

**Recommendation:** Introduce branches under agencies, reuse shared enrollment/personnel records, and keep historical work attributed to its original branch. Use the approved schema baseline and complete the remaining financial/access decisions before approving migrations.

Planning update: the existing supplied schemas are now the authorized authoritative baseline, and the user confirms no database changes since migration began. Schema discovery for this design proceeds offline against those artifacts; it is not blocked on a new export or direct database login. Pre-implementation validation means checking relevant deployment/migration metadata for drift, not repeatedly asking for the same unchanged schema.

## Evidence and development database access

Reviewed local code: `src/db/index.ts`, `src/lib/repositories/auth-identity.ts`, `visit-financial-reads.ts`, `manager-scheduling.ts`, `caregiver-visit-execution.ts`, `patient-service-contracts.ts`, `lead-integrations.ts`, `public-contact.ts`, and `src/components/AgencyProgramsContent.tsx`.

The code uses active agency membership, transaction-scoped actor context, agency-scoped repositories and RLS support. Scheduling already resolves visit timezone from the service address. Programs are presented through agency application records. These are code observations, not live-schema verification.

No dedicated Neon/Supabase connector or confirmed development database connection is available in this session. No credentials, environment-file contents, live tables or rows were inspected. Exact relation names below are conceptual proposals, not executable SQL or a verified exhaustive table list. Before implementation, verify the intended development Neon project/branch/database identity and inspect schema metadata, indexes, constraints, functions, triggers, grants and RLS. If direct access is unavailable, accept an operator-provided schema-only export with environment identity; do not request record dumps. Verify staging/production schema parity before rollout. Do not query the retired/wrong Supabase project.

### Preferred schema knowledge workflow: operator exports, agent works offline

Existing artifact reuse confirmed on 2026-11-21: the user states the schema has not changed since migration. Both previously supplied schema-only files remain available outside Git, with checksums matching the migration evidence: `mycaresight-neon-production-schema.sql` (SHA-256 `a80a985285685b16e023ebdf8a0313960893f79c04d7cd8e710e84a871702a6e`) and `mycaresight-supabase-production-schema.sql` (SHA-256 `c4e374478a29c7b3149652e4e3dfc92f8fd5e97d60be11ee3d5b7e15795f6d97`). Use the Neon artifact as the target planning baseline, with the source artifact for historical comparison, and reconcile any subsequent applied migration definitions. No new export is required to continue this design. These are production-named snapshots; development parity and any post-capture changes must still be checked before implementation, without claiming a new live verification. Do not copy the private artifacts into Git.

The user wants schema knowledge without granting the agent a route to mutate a database. Prefer an operator-generated schema-only artifact, not a live connection with a promise to use only SELECT. The agent receives no database credential or live connector for this work. The user reviews and applies every future migration script directly; generating or saving a proposed script never authorizes its execution. Do not run a migration runner, ORM push, schema synchronization, deployment or CI auto-apply against a connected database as part of design.

1. Reuse the approved existing artifacts for this unchanged baseline; no fresh export is required now. If schema changes or missing metadata require a refresh, the operator verifies the intended Neon project, branch and database, then runs a reviewed schema-only exporter locally. Record capture time, environment identity, migration-ledger version and artifact checksum. Include table/column/type definitions, keys, constraints, indexes, views, functions, triggers, RLS enable/FORCE state, policies and relevant grants/default privileges. A table-name list alone is insufficient for authorization design.
2. Exclude business/auth/session rows, data dumps, passwords, connection strings and storage credentials. Schema definitions can themselves contain embedded constants or credentials; review/sanitize before sharing and identify redactions so missing evidence is not mistaken for absence. Include role properties/membership metadata needed for RLS as a separate reviewed metadata inventory without password hashes. Keep original artifacts private and outside Git by default.
3. The agent reviews those supplied artifacts offline against application access paths and records verified facts versus gaps. A dated live-generated export is authoritative for that captured environment, not proof of current production parity. Refresh after schema changes and before implementation or deployment.
4. After design approval and the stabilization gate, prepare reviewable additive migration scripts and synthetic tests on the feature branch. The user executes approved scripts, starting in development/staging, and returns sanitized metadata/count/check results. Production execution remains separately operator-controlled. Rollback scripts receive the same review; no automatic application.

This creates a concrete boundary: offline schema review cannot change the database through a connection it does not have. It is not a claim about unrelated existing production deployment workflows; audit those separately if the user wants the same manual-only policy applied to them. A future direct metadata-only login is a different design requiring verified privileges (including role inheritance, CREATE/TEMP and executable functions); `default_transaction_read_only` alone is not an equivalent access boundary.

## Proposed data model

### First product release: Agency Info and branch setup

User proposes moving Company Info/Company Details from the profile into Configuration, renaming it **Agency Info**, and managing the main/default and additional branches there. Recommended information architecture below is a planning proposal, not an implemented navigation change.

```text
Configuration
  Agency Info
  Branches
  Lead Pipeline       [existing permission/capability applies]
  Work Schedule       [care operations only]
  Pay Rules           [care operations only]
  Mileage             [care operations only]

Personal Profile
  Personal Information
  Existing account/security controls
  Agency Info link    [optional compatibility/discoverability link]
```

Use Agency Info as the agency-admin default Configuration section. Prefer Branches as a sibling section rather than hiding every office within a long legal-information form. Both belong to Configuration; a one-branch agency sees a simple default-branch card with an Add Branch action. User's “main branch” means the first/default operational branch, not a second agency/legal entity. “Default” is a routing designation and can be changed independently of the legal office.

Remove agency Branding navigation and its configuration-only editor/data loading in the implementation slice. Local code contains `AgencyBrandingSection` and branding actions/readers, so do not assume the runtime infrastructure is absent: inventory consumers and retain layout/logo/theme readers and shared platform branding as needed to preserve existing appearance. Do not drop branding columns, delete logo files, reset saved colors or remove shared `BrandingForm` merely to remove the agency settings section. No replacement tenant customization UI is planned.

#### Information ownership and initial workflow

| Surface | Fields/responsibility | Initial access |
|---|---|---|
| Agency Info | Agency/legal name, DBA, business type, EIN/tax identity, website, registered/licensed/mailing information and organization-wide contact fields as already supported | Agency admin edits; do not copy sensitive legal fields into every branch or automatically expose them to coordinators |
| Branches list | Branch name/code, office address summary, status and Default badge; bounded counts/summary where authorized | Agency admin sees/manages all; coordinator branch summaries limited to assigned scope if needed |
| Branch editor | Name, unique agency-local code, office address, phone/email, timezone and active/inactive status | Agency admin manages; validate and audit on the server |
| Default designation | First branch automatic; later change uses explicit confirmation describing new-record-only effect | Agency admin only; cannot select an inactive branch |
| Leads/clients | Default branch on create; permitted branch selector/change action and branch filter | Existing role/capability permission intersected with branch scope |

Copy entered first-location data into the first branch only through a reviewed onboarding/backfill step; do not invent additional locations or copy agency EIN/license numbers as branch-specific legal credentials. Existing `agencies` physical/licensed/mailing fields and current readers must be mapped explicitly: identify which remain organization/legal fields and which legacy readers need a compatibility projection from the default branch. Avoid two independently editable sources for the same office address and avoid automatic bidirectional synchronization. A branch office change must not silently update legal/registered-office fields.

Branch setup MVP does not require license number, assigned caregiver, a schedule, payroll settings or a purchased program. Use existing program/license references for later applicability rather than free-text copies of license evidence. Draft minimum branch inputs: name and office address (city/state/postal included), with unique code generated or entered under an approved rule and timezone derived where reliable but confirmed if ambiguous. Phone/email may inherit an explicitly displayed agency contact fallback until overridden; decide requiredness before implementation. Use the shared phone/email controls and common server/client Zod schemas.

New agency: save agency identity and first/default branch atomically within existing onboarding. Existing agency: show the current organization details, propose an editable first-branch mapping from verified existing location fields, have the admin confirm it, and reconcile existing operational leads/clients before mandatory branch constraints. Do not interrupt ongoing use through a destructive move of profile data. Additional branches create no duplicate agency, license application or client records.

#### Reuse and current-code findings

- `src/components/ProfileTabs.tsx` currently owns Company Details and uses React Hook Form with `companyDetailsSchema` from `src/lib/schemas/profile.ts`, calling `saveCompanyDetails` from `src/app/actions/agencies.ts`. Extract/reuse the relevant editor and existing action boundary rather than copy/pasting the full form. Do not rename database columns merely to change the visible title to Agency Info.
- `ProfileTabs` is shared across profile routes. Review every consumer; remove/move only the agency-admin Company Details entry. Keep personal and account behavior intact for agency, platform, expert and caregiver profiles. Old entry points should link to the new canonical editor rather than retain a second editable implementation. Preserve existing View Details, validation and save behavior unless an approved field split requires a separate change.
- `src/app/pages/agency/profile/page.tsx` currently resolves agency details through administrator relationships. The Configuration route uses current agency context. Reconcile those server-side resolution paths through active membership and canonical agency ID before moving the editor; do not accidentally let the URL select another agency.
- `src/components/AgencyConfigurationContent.tsx` currently defaults to Work Schedule and holds schedule/pay/mileage fields in a shared form. Agency Info and Branches need separate save boundaries so an office edit cannot submit default payroll values or fail hidden scheduling validation. Do not wrap independent forms in a nested or universal Save form.
- `src/app/pages/agency/configuration/page.tsx` eagerly loads configuration, lead stages and branding, and may seed lead stages during rendering. Remove the configuration-only branding fetch/props with the removed section; preserve unrelated layout branding reads. The initial Agency Info shell must not depend on unrelated sections. Lazy-load remaining sections independently; audit existing seeding behavior and avoid triggering it just by opening Agency Info. Any change to existing side effects requires focused regression review, not an incidental broad rewrite.
- `src/components/DashboardLayout.tsx` includes Configuration without a care-operations capability on the agency-owner menu. Keep Agency Info/Branches available to leads/client-only agency admins. Gate schedule/pay/mileage category data, UI and server actions by their actual entitlements/permissions. Hiding a navigation item alone is insufficient. Coordinator permissions and navigation must be evaluated independently rather than exposing admin settings for branch selection.

#### Revised delivery priority

**Phase 1 setup batch:** move/relabel the agency editor and add branch/default management. This is agency-administrator configuration, not coordinator permission segregation. See the active rollout runbook for implemented fields and gates.

**Phase 1 records batch:** default/current branch ownership for agency leads and clients, filtered lists/counts, conversion rules and shared HomeSights enrollment associations. Existing coordinators remain agency-wide. Selected/ALL user grants and complete child/document/storage/job/cache/RLS restrictions belong to Phase 2 and are not enabled in Phase 1.

**Later care-operations release:** add visit-series/occurrence attribution, personnel eligibility, scheduling/offers, EVV, approvals/corrections and existing financial reporting according to the full plan. Leads/client-only agencies need not wait for this release. Agencies with care operations must retain existing behavior or stay outside restricted-branch rollout until all their care paths are protected. Do not allow toggling care capability on for a restricted agency until the care-branch readiness gate passes.

This staged approach changes the product priority, not the authorization standard. Future fields/associations can be designed now; avoid exposing unfinished clinical features or performing a broad dormant-table rewrite in the first release. No implementation is authorized during stabilization.

#### First-release acceptance additions

- A leads/client-only agency admin can reach Agency Info and create the default/additional branches without loading scheduling/payroll data or granting `care_operations`.
- Legal agency information and branch office information have one authoritative owner each; editing one cannot overwrite the other or change pay rules.
- Existing agency/profile details are retained, single-branch defaults work, and old profile entry points lead to the canonical editor. Shared profile consumers and account-security controls remain intact.
- Agency Configuration has no Branding entry/editor or configuration-only branding request. Existing logo/theme rendering and platform branding remain unchanged; verify with synthetic visual regression coverage.
- Agency admins see all branches; coordinators cannot edit Agency Info/default/grants through direct requests. Authorized branch summaries do not disclose EIN, private personnel data or unrelated records.
- Branch lists and selectors are server-bounded; Agency Info is a small initial authorized read; branch editor data loads on opening. Hidden sections issue no requests. Audit and cache invalidation cover changes.
- Existing visits and financial history remain untouched in releases 1A/1B. A lead/client branch transfer cannot bypass any enabled care-workflow safeguard.
- Validate form schemas, `fieldErrors`, shared phone/email fields, keyboard/focus behavior and the affected Profile/Configuration/Lead/Client workflows with synthetic fixtures before release. The existing Profile form uses shared schema/RHF, while Configuration's schema is currently local and action responses use a different shape; map these gaps explicitly when refactoring, without silently changing all configuration contracts.

### Proposed later phase: agency defaults with branch policy overrides

User asks whether branches, especially across states, can have distinct work schedules, pay rules and mileage reimbursement. Recommendation: yes, through effective-dated branch overrides of agency defaults, not fully independent copies of payroll configuration. This is a saved design proposal pending approval; it is outside the initial leads/client-only branch release. Branch address/state alone is not enough to determine applicable employment rules, and configuration is not an automatic legal-compliance engine.

| Setting family | Proposed scope | Important boundary |
|---|---|---|
| Operating hours/days, weekend scheduling, local timezone and operational holidays | Agency defaults with branch overrides | Office availability is different from caregiver availability and the legally relevant payroll workweek |
| Weekend/holiday premiums, permitted pay-policy parameters | Effective-dated agency policy plus approved branch overrides | Existing individual caregiver pay rates and contracts stay authoritative under an explicit approved precedence; avoid inventing flat branch rates |
| Payroll workweek definition and overtime aggregation | Approved employer/employee payroll policy, consistent across a worker's branch assignments | A branch switch or branch-filtered report must not reset the workweek or exclude other-branch hours |
| Mileage reimbursement enabled state, effective date, eligible mileage and rate | Agency default with explicit branch override where approved | Employee reimbursement differs from mileage charged to a patient/payer; use actual trip/work facts and contracts |
| Client billing rates and limits | Existing patient service contracts and approved billing rules | A branch reimbursement change never silently changes a contract's billable mileage or service rate |

Federal design reference: [29 CFR 778.103](https://www.govinfo.gov/content/pkg/CFR-2025-title29-vol3/xhtml/CFR-2025-title29-vol3-part778.html) requires totaling covered nonexempt work for the employer in the workweek, including different assignments. [DOL Fact Sheet 23](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay) explains overtime and regular-rate implications of different pay rates. Do not split overtime into separate branch buckets. Review applicable state/local requirements and actual work location with the agency's payroll/legal owner before enabling jurisdiction-specific calculations. No state-law conclusions or blanket “most generous setting wins” algorithm are proposed here.

#### Policy model and calculation integration

Existing `agency_configurations` and `saveAgencyConfiguration` currently save one agency-level set of schedule/pay/mileage values; `src/lib/payroll-billing-report.ts` consumes agency config, caregiver rates and patient contracts. That existing shape cannot become branch-aware simply by adding a branch selector. Inventory all reads, including financial creation/approval, recalculation, reports, exports and jobs, and have them use one application-owned effective-policy resolver.

Propose typed, versioned agency policy defaults and branch override records with agency/branch identity, policy version, effective-from/to, change actor and audit reference. Exact table/column layout is subject to schema design approval. Avoid unconstrained configuration JSON or editable copied snapshots that drift. Explicit per-setting inherit/override state is needed: false, zero, disabled and intentionally empty are meaningful overrides and cannot be replaced by truthy fallback or a naive null coalesce. Define holiday-set inheritance/replacement explicitly; do not accidentally apply agency and branch premiums twice.

The resolver returns effective settings plus provenance (agency vs branch, version and date). A new agency default affects inheriting branches according to effective dates; an explicit branch override remains in place. Provide a preview of affected branches/periods before changing defaults. Use immutable history so inheriting branches' past effective rules remain reconstructable even after parent defaults change. Test resolver performance through batched policy lookup/caching by agency, branch and version/date, without one query per visit.

At approval/calculation, record the effective policy/version and necessary calculation inputs in an approved immutable financial evidence boundary, potentially the existing `visit_financials.calculation_basis` after contract review. Rate/policy edits must not recalculate posted/approved history merely because a report was opened. Corrections/recalculations use the existing reviewed financial adjustment path and preserve original lineage. Unstarted visits may resolve policy for the actual service date; a visit spanning a policy/jurisdiction boundary needs an explicit segmentation rule before supported use.

Cross-branch payroll first gathers the worker's authorized employer-wide hours and relevant rate/policy inputs under an approved service boundary, calculates owed totals, then allocates results to branch reports. A coordinator's branch filter must not change the calculation or reveal other-branch client detail. If separate legal employers exist, model that separately rather than equating branch with employer. Multi-state actual work, cross-midnight/DST shifts, travel between branches, regular-rate combinations and branch reassignment require specific tests and payroll-owner decisions.

#### UI, permissions and rollout

For care-enabled agencies, retain agency Work Schedule/Pay Rules/Mileage as defaults. A branch settings surface shows each effective value with **Inherited from agency** or **Branch override**, an explicit **Use agency default** action, effective date and authorized change history. Do not mix policy editing with the basic Branch Info save. Agency admins manage these policies; any delegated financial-policy editor needs a separately approved capability, not automatic permission from branch assignment or coordinator status.

Leads/client-only agencies see Agency Info and Branches without pay/schedule/mileage requirements or hidden queries. Do not enable or load these optional settings in the initial branch release. Before the later release, confirm supported states/work scenarios, payroll workweek ownership, rate precedence, travel eligibility, reimbursement versus billing fallback, premium stacking, effective-date semantics, retroactive correction process and policy-change permissions. Preserve existing calculations until that design and representative synthetic regression fixtures are approved.

Additional acceptance: inheritance vs explicit disabled/zero values; parent changes respecting overrides and historical periods; policy version audit; service-date selection and boundary segmentation; no retroactive financial changes; hours/overtime across branches; different-rate regular-rate cases; client mileage billing unaffected by reimbursement edits unless explicitly contracted; branch-filtered allocation reconciles to employer totals; no policy edit through unauthorized direct requests; and bounded batch resolution at baseline/10x workload.

### Schema-grounded design refinement — November 21

The supplied Neon artifact contains 91 `public` table definitions and no existing branch entity/association in that inventory. Reviewed relevant column definitions, foreign keys, membership uniqueness, RLS flags and selected authorization/synchronization functions. This is an offline review of the approved snapshot, not a live database probe. Existing objects below are verified in that artifact; new names are proposed design identifiers only. No migration SQL has been drafted.

#### Existing facts that determine the design

1. `agencies` contains legal/entity, physical, mailing and licensed-office fields. Retain legal ownership and existing fields for compatibility; branch office fields are additional operational locations, not a wholesale move/rename of agency data. Do not assume an office address determines historical branch identity.
2. `user_agency_roles` has an `id` and uniqueness on `(user_id, agency_id, role)`. Existing `sync_user_agency_role()` synchronizes membership from `agency_admins`, `care_coordinators` and `caregiver_members`; it can delete/recreate memberships when identities/agencies change. Branch grants must follow this lifecycle, not survive as orphaned grants or silently reset to ALL on recreation.
3. `user_profiles.work_location` is free text, not an authoritative branch relationship. `agency_admins.agency_id` and `care_coordinators.agency_id` identify agency/personnel roles; they should not each acquire a competing branch-access model. Use the canonical active membership for authorization and caregiver membership separately for scheduling eligibility.
4. `applications` is the agency-owned workflow, with `agency_id`, `license_type_id`, `playbook_id`, `caregiver_member_id`, status and progress. `application_steps`, `application_documents`, `application_playbook_items` and rule checks depend on it. A single shared application currently means one workflow; branch-specific progress is not already modeled. Exclude caregiver-specific credential applications from agency-program sharing unless separately designed.
5. `license_types` and `playbooks` are reusable definition anchors. `licenses` is separately agency-owned. Do not assume an application and issued license have an automatic one-to-one link or infer one by matching names. `certification_applications` exists, but its column names alone do not establish that every license/program uses that linkage.
6. `leads.agency_id` is nullable and `lead_type` distinguishes workflows; `patients.agency_id` is required. Enforce branch assignment on agency-owned operational/client leads, not platform sales prospects that do not yet have an agency. The sales-to-agency workflow must create the new agency/default branch before related client records are routed.
7. `patient_service_contracts` belongs to patient and agency; scheduled visits reference `contract_id` and `patient_address_id`. Branch is responsible office ownership, not a replacement for patient address or service contract identity. Contracts carry service/rate terms and should not be copied on every branch transfer.
8. `visit_series` and `scheduled_visits` have agency/client linkage; visits already store `visit_timezone`. `visit_time_entries`, `visit_approvals`, `visit_financials`, adjustments and corrections carry historical evidence. Snapshot branch on the visit and use that lineage throughout; current client ownership is not a safe historical-report join.
9. The artifact includes no `invoices`/`invoice_items` or legacy `billing` table. Local legacy `src/app/actions/billing.ts` still references `billing`. Treat that as an unresolved legacy surface, not proof that an invoice engine exists. Plan current care Time & Billing/report branch support against verified visit-financial tables; inventory platform subscription/program charges separately before extending any invoice scope. Do not create a missing legacy table as an incidental part of this enhancement.
10. Existing helpers such as `visit_financial_manager_can_read`, `caregiver_can_execute_visit`, `scheduling_caregiver_can_read` and `internal_note_write_allowed` check agency/role/resource relationships without branch predicates. Browser filtering alone cannot make these branch-safe. Several care tables already use ENABLE and FORCE RLS; exact policy composition must be reviewed per table so a broad existing permissive policy cannot bypass a new narrow one.

#### Concrete candidate changes, not executable DDL

| Existing anchor | Proposed addition | Why this is the smallest coherent change |
|---|---|---|
| `agencies` | `default_branch_id`, referencing new `agency_branches` | One canonical default; avoid competing `is_default` flags and pointers |
| New `agency_branches` | Agency ID, stable ID/code, name, lifecycle status, timezone and operational office/contact fields | Separate operating location from legal agency identity; unique `(agency_id, code)` and a same-agency composite reference target |
| New `agency_member_branch_scopes` | One mode/revision row per `user_agency_roles.id` | Keeps branch authorization separate from synchronized membership fields; role/membership remains authoritative |
| New `agency_member_branches` | Membership ID, agency ID and branch ID | Explicit selected grants with same-agency checks; no grant for absent/inactive membership |
| New `caregiver_branch_assignments` | `caregiver_members.id`, agency and branch | Supports non-login caregivers as resources; user access grants do not silently add scheduling eligibility |
| New `application_branches` | Application ID, agency and branch | One enrolled workflow can cover several branches; primary key/uniqueness prevents duplicate association/counts |
| New `license_branches`, if issued-license applicability is required | Issued license ID, agency and branch | Explicit applicability; populate through verified issuance/administration workflow, not inferred application matching |
| `leads` and `patients` | Current `branch_id` with same-agency constraint | Branch selection/defaulting and audited transfer without copying records; branch required only for scoped operational leads |
| `visit_series` and `scheduled_visits` | Planning `branch_id` on series and snapshot `branch_id` on each occurrence | Stable responsibility for recurrence, offers, EVV and historical reports |
| Existing child/evidence tables | Derive branch through visit, lead, patient or application initially | Avoid redundant independently mutable branch columns; add constrained financial snapshot only if proven necessary |
| Existing `audit_log` | Identifier-only branch/grant/default/transfer change evidence through current audit boundary | No new generic content log or private-record duplication |

Proposed names are reviewable candidates, not final schema/API commitments. New junctions require same-agency composite foreign keys or equivalent verified constraints. Default creation must use an atomic transaction and agency lock/deferrable relationship where needed to resolve the agency/first-branch reference cycle. Changing the default never cascades a reassignment. Disable/inactive branches remain referenceable historically but cannot receive new work.

Do not add `branch_id` to global catalogs, profiles, audit events or every child merely for uniformity. Audit may use existing structured metadata with identifier-only values. Scope revision is a cache-invalidation mechanism, not a replacement for current database authorization.

#### Enrollment selection, shared progress and branch permissions

Extend the existing `ApplyForNewLicenseButton` flow and `submitProgramRequest` boundary with a validated nonempty branch selection, defaulted for a one-branch agency. Create the application and its branch associations atomically; existing retries must not create duplicate applications, notifications or charges. The coordinator can select only authorized branches; an agency administrator may select any eligible active branch. Branch management/link changes are separate audited mutations and do not resubmit a program.

Confirmed by the user: one shared application retains one set of steps, progress/status and common documents. Use separate applications when a branch requires a genuinely separate legal/operational workflow. Do not clone every playbook item merely because a second branch is associated. Shared common documents are application-level resources for authorized participants in the associated branches; this does not expose unrelated agency/client documents or grant a coordinator permission to alter scope or shared state affecting unauthorized branches. The detailed mutation/field-access matrix still requires approval.

Read policy should distinguish harmless shared metadata from protected child contents. A coordinator may discover an enrolled program if at least one associated branch is permitted. That intersection must not automatically authorize all underlying documents, agency-wide notes or updates affecting inaccessible branches. Draft safe default: edits to shared progress/status or association sets require agency-admin authority or authorization covering every affected branch, plus existing workflow permissions. Branch-local content requires explicit applicability and filtered access; if MVP cannot represent it safely, keep those cross-branch documents/actions admin-only rather than inventing hidden exceptions. Platform expert access stays within existing verified assignment boundaries.

Adding a branch to an existing enrollment intentionally changes who may discover it; removing the last branch is refused while the application remains operational. Apply analogous eligibility checks to any issued-license association. Linking a branch is not evidence of legal coverage or a new billable application.

#### Resource-by-resource access path

| Resource | Authoritative branch source | Review requirement |
|---|---|---|
| Operational lead, lead tasks/notes/documents/details | Current lead branch | Validate parent agency and grant on each access; assignee must be eligible or reassigned explicitly on transfer |
| Current client details, addresses, representatives and care-plan configuration | Current patient branch | Transfer needs a policy for historical clinical details; do not grant full patient visibility through a historical visit |
| Visit, visit tasks, time, approvals, adjustments, corrections and financial rows | Persisted visit branch | Historical visit endpoints return only necessary authorized detail; maintain current caregiver assignment checks |
| Program application, steps/items/documents/rule checks | Explicit application branch set plus content/action policy | Shared enrollment intersection is not universal child-content permission |
| Issued license and its documents | Explicit reviewed license applicability | Do not derive by text/name/state heuristics |
| Caregiver eligibility vs private personnel/pay | Resource branch assignments plus existing field/capability rules | Coordinator may see a minimal matching summary without unrelated pay/personnel/history |
| Shift offers/recipients and assignment/unassignment requests | Underlying visit branch | Selection and acceptance both revalidate; permissions may change while offer is open |
| Conversations/messages, internal notes and tags | Authorized subject/application/visit; tags checked independently | No inferred office ownership from `client_id`; verify actual entity namespace/linkages |
| Agency-level notes, configs, onboarding and key staff | Agency-wide admin scope unless explicitly classified branch-local | Do not expose all agency content to selected coordinators merely because a row lacks branch ID |
| Catalog definitions | Existing global/product visibility | Never return enrolled/application/private content through catalog browsing |

Existing branch-unaware helpers should be supplemented with resource-aware authorization or safe wrappers; do not silently change an agency-level helper's meaning in a way that breaks onboarding/catalog calls. Enumerate direct action/API callers, RLS policy expressions, database triggers and jobs. Avoid trusting transaction branch variables set from the browser, or SECURITY DEFINER recursion/privilege bypasses. Test actual role grants and both USING/WITH CHECK behavior for inserts and branch changes.

#### Transfer and history contract

Use a dedicated transfer command, not a generic patient UPDATE. It locks current ownership, validates the target, identifies active visits/assignments/contracts and writes identifier-only history in one transaction. Draft metadata history records include agency, resource identity/type, old/new branch, actor, effective time and outcome; do not copy names, clinical notes or documents into transfer history. No transfer writes are implemented by this plan.

Confirmed default: existing series/visits remain in their original branch. A reviewed future-work transfer must separately decide whether to move selected unstarted occurrences, update the recurrence planning branch, cancel stale offers and revalidate caregivers/contracts. In-progress/completed/evidenced work is never silently rewritten. The UI must make the retained future work visible to administrators so the client move does not imply the calendar was moved too.

Initially, the visit branch is authoritative for Time & Billing and payroll report allocation. Financial rows stay linked to their visit; prevent branch mutation once time or financial evidence exists. If a later requirement permits reattribution, model a dedicated adjustment with lineage and audit rather than changing the visit behind posted charges. Historical caregiver-wide overtime calculation must precede per-branch reporting allocation, so a branch filter cannot change earned overtime or double-count it.

#### Dependency order and reviewable slices

| Slice | Deliverable | Exit gate |
|---|---|---|
| A — design and fixtures | Approved object/access matrix, application-sharing rule, historical access and approved backfill mapping policy | No implementation during stabilization; schema metadata evidence is already available |
| B — additive branch foundation | Reviewed operator-run schema scripts, branch/default admin service, typed associations and synthetic fixtures | Same-agency/default/concurrency tests; no restricted-user rollout |
| C — full authorization foundation | Effective membership scope, permission revision/session invalidation, child/file/job/RLS coverage | Direct-ID, counts, caches and policy bypass tests all pass before UI restriction activation |
| D — normal agency workflows | Lead/client defaults, personnel/program links, branch selector and reviewed transfer UI | Existing single-branch workflows pass; shared enrollment actions cannot leak or alter inaccessible branches |
| E — care operations and finance | Recurrence/visit attribution, offers, EVV completion, approvals/corrections and scoped financial reports | History, concurrency, cross-branch overtime and reconciliation tests; no invoice-engine invention |
| F — staged release | Operator-run development/staging scripts and acceptance, approved production mappings, pilot and monitoring | Human approval; no agent pushes, remote merges, database changes or deployment dispatch |

These are dependency slices, not permission to expose partially scoped features. Prefer additive structures hidden behind rollout gates until the complete care authorization path is ready. Update the existing manual production workflow plan before applying this enhancement if it would automatically execute new migrations; user-only script execution must be enforced for this feature rather than assumed from a manual app-deploy button.

Estimate implementation only after slice A decisions; this is a cross-cutting authorization/data-model enhancement, not a small branch-dropdown change. A lower-risk first release can keep invoicing/legal-entity/rate changes out while still delivering branch-attributed existing Time & Billing and reports.

| Concept | Relationship and purpose | Integrity/lifecycle |
|---|---|---|
| Agency branches | Agency has many branch records with stable ID/code, name, status, office contact/address and IANA timezone | Code unique per agency; preserve referenced branches rather than hard-delete |
| Agency default branch | Agency points to exactly one active default after rollout | Same-agency reference; first branch/default created atomically, including concurrent/retried requests |
| Lead/client current branch | One current branch per agency-owned lead/client | Same agency; default on creation; audited change; preserve approved branch on conversion |
| Membership branch scope | Existing user-agency membership has `all` or `selected` mode plus explicit membership-to-branch links | Active membership/role required; selected with no assignments grants no access; ALL includes future branches |
| Caregiver branch assignments | Caregiver agency membership links to many branches | Additional eligibility constraint, not a replacement for skills, credentials or availability |
| Enrolled-program branch assignments | Agency-owned enrollment/application links to many branches | Reuse one enrollment; separately model branch-specific approval requirements if needed |
| Visit branch snapshot | Each visit has one responsible branch, inherited when scheduled | Same agency; recurring occurrences each retain their attribution; never derive historical branch from current client ownership |
| Financial branch attribution | Charge/time allocations derive from their visit or immutable source | Every amount attributed once; shared costs require explicit allocations, never copying the full amount to every branch |

Use explicit typed junctions, not generic polymorphic entity links or branch-ID arrays. Derive child scope from its parent where sufficient; do not independently add branch columns everywhere. Any denormalized references require consistency enforcement. Do not duplicate global profiles or program definitions. Authorization scope, caregiver eligibility and program availability remain distinct relationships.

Changing the default affects new records only. It never reassigns existing clients, visits or financial history. An explicit branch choice must be validated against agency, caller access, status and relevant program eligibility. If a coordinator cannot access the agency default, require an authorized selection rather than silently creating inaccessible records. Single-branch UI may hide the selector while the backend still enforces scope.

Branch retirement requires a replacement active default and disposition of clients, future work, personnel links, pending time/approvals, contracts, jobs and integration routing. Inactive branches remain available for authorized historical reports.

## Authorization and historical access

Effective access = existing tenant, role/capability and active-membership permission intersected with branch scope and resource-specific authorization. Confirm that agency administrator maps to existing `company_owner`; do not repurpose global platform `admin` or invent another privileged role just for branches. Platform administrators and experts retain only their current approved access paths.

Resolve scope server-side per request or through a short revocable cache. Never trust posted branch IDs, ALL flags or browser-selected agency context. Filters mean all permitted branches unless explicitly narrowed. Unauthorized explicit branch requests fail closed. Caregiver branch association alone never permits access to all clients or arbitrary EVV actions.

Cover repositories, RLS, related-record routes, searches/counts, signed documents, notes, conversations, financial reads/writes, jobs and exports. Shared caregiver summaries must not expose private personnel fields or unrelated branch visits/pay. Shared program metadata must not expose another branch's protected documents. Revocation invalidates sessions/effective-scope caches and queued deliveries; pending/invited memberships remain non-operational.

Client transfers need an explicit policy for old-branch historical visit access and new-branch access to current client records, notes and documents. Neither branch should automatically gain the entire history merely through a visit link. Handle an in-progress caregiver's authorized completion/handover before removing eligibility; do not strand clock-out or broaden permissions as a shortcut. Emergency overrides are excluded unless separately approved.

## Scheduling, visits and EVV

Visits and recurring-series planning carry branch context; every generated occurrence receives its own snapshot. Validate client, caregiver, enrollment/contract and branch compatibility in the transaction. Candidate ranking, assignment requests, open shifts and broadcasts use the same eligibility rules and return no duplicate candidates.

Confirmed transfer behavior: change current client ownership and future unscheduled defaults; keep existing visits. A separate reviewed future-transfer operation previews affected unstarted visits, series rules, assignments, offers, contracts and approvals. Lock/revalidate on commit against concurrent clock-in, assignment acceptance or billing. Never silently move in-progress, completed, approved, invoiced or financially evidenced visits.

EVV service location remains the actual patient/service address, not the branch office. Preserve raw UTC events, existing visit-local timezone, coordinates, signatures and correction history. Branch timezone is an administrative/reporting context and cannot rewrite that evidence. Define report-day semantics for cross-timezone visits and test midnight/DST boundaries. If an external EVV integration exists or is introduced, verify required branch/provider identifiers and effective-date mapping separately.

## Billing, payroll and program rules

- Draft default: agency remains the legal billing entity; branch adds operational attribution/filtering. Separate branch tax identities, payer enrollment, bank accounts or invoice numbering require an explicit later decision.
- Financial history follows visit/source branch, not current client branch. Corrections, credits and reversals preserve original lineage.
- Agency invoices may contain branch-attributed lines/subtotals; decide whether mixed-branch invoices are allowed. Never assign a misleading single header branch or expose unauthorized lines/totals to a restricted coordinator.
- Preserve caregiver-wide overlap detection and overtime across branches. Filtering must not reset overtime or double-count shared personnel hours; denial messages must not reveal other branch PHI.
- Confirm rate precedence, travel-time compensation and shared-cost allocation before modifying calculations. Reuse existing calculators/contracts rather than creating a parallel billing system.
- Sharing an enrollment does not create a second application, duplicate charges or satisfy branch-specific licensing/service-area approval. Reuse `ApplyForNewLicenseButton` and `CreateLicenseModal` for applicable workflows.

## Impact inventory

| Area | Required review/change |
|---|---|
| Agency setup/onboarding/settings | First/default branch, branch management, retirement and approved existing-agency mapping |
| Identity/permissions | Membership scope, ALL, active-status checks, session/cache invalidation, RLS/grants/functions |
| Agency leads and clients | Creation/defaults, authorized edit/transfer, conversion, tasks, related notes/docs, contacts/representatives and care plans |
| Website/API intake | Agency-scoped integration routing/defaults and replay behavior. Platform `/contact` creates agency-sales leads without an agency; do not invent branch ownership for these |
| Users/personnel/caregivers | Multi-branch links, manager controls, eligibility, availability, credentials, rates, private fields and shared-resource redaction |
| Agency Programs/licensing | Enrollment/application links, status/playbook/doc visibility and branch eligibility without duplicating catalog definitions |
| Scheduling and offers | Branch/date-bounded calendars, recurrence, assignment, requests, open offers, deduplication and cross-branch conflicts |
| EVV/time/approvals/corrections | Visit attribution, actual service location, timezone, historical visibility and safe handover |
| Billing/payroll/reports | Source attribution, scoped badges/counts, reconciliation, invoice lines, corrections, allocations and cross-branch overtime |
| Documents/notes/messages | Parent-derived scope, signed URLs, shared-resource content access, search and retention |
| Cross-cutting | Dashboards, Task Center, caches/tags, exports, background jobs, notification recipients, audit and deferred mobile API contracts |

Implementation anchors include patient/lead actions and query boundaries; `src/lib/repositories/{manager-scheduling,visit-caregiver-candidates,visit-shift-offers,caregiver-visit-execution,visit-corrections,manager-visit-edit,visit-financial-reads,visit-financial-writes,patient-service-contracts}.ts`; `src/lib/storage/`; `src/lib/cache-tags.ts`; `src/lib/server-cache/`; `src/lib/payroll-calculations.ts`; and `azure-functions/src/`. Discover all indirect callers before marking the table-by-table inventory complete.

Jobs carry validated agency/resource branch context and revalidate recipient/export permissions before delivery. Notifications should link to authorized views without adding care details to external email payloads. Branch changes are not permission to add PHI-bearing integrations.

## Performance and UI contract

Reuse existing shared controls, forms, modals, role navigation and server query boundaries. Add branch management and an authorized branch selector, with explicit empty/error states. Deep links and persisted filters carry context, not authorization. Do not bulk-refactor unrelated screens.

Keep lists server-filtered, stably ordered and paginated; return lightweight counts under the identical scope. Search/paginate large branch and personnel assignment choices. Calendars query the visible date window plus a documented buffer and bound/virtualize resource rows. Lazy-load assignment editors, transfer previews and enrollment details only when opened. Avoid fetching entire agencies for branch filtering.

Use indexed tenant/branch predicates, reverse indexes on junctions and `EXISTS` or deduplicated relations so shared resources cannot multiply rows/totals. Candidate indexes include agency/branch/date and membership/branch lookups, finalized only after schema and query-plan review. Cache keys include actor/effective permissions, agency and branch filter; invalidate scope changes promptly.

Before implementation, set numerical latency/query budgets against aggregate sizing. Draft synthetic baseline/10x workloads: 10/100 branches, 1,000/10,000 clients, 100/1,000 caregivers and 10,000/100,000 visits per agency. Record actual bounds, query counts/plans and list/calendar timing. Unbounded reads, N+1 requests and duplicated totals fail acceptance even when small fixtures look correct.

## Phased delivery and rollback

1. **Phase 1, now authorized:** agency-administrator onboarding using leads, clients and HomeSights services. Implement setup and record associations under the existing agency boundary, rehearse with synthetic data and prepare operator-only additive SQL. Current coordinator permissions remain agency-wide. Exact implementation, validation and manual development/UAT gates are in [the rollout runbook](agency-branches-rollout.md).
2. **Phase 2, deferred:** introduce selected/ALL personnel scope only after all enabled queries, children, files, jobs, exports, caches and RLS enforce it. Add caregiver eligibility, historical transfer/visit/EVV/finance attribution, branch policy overrides and corresponding operational screens. Resolve the remaining licensing/financial/history policies before this phase.

Do not silently assign every coordinator ALL. Preserve existing record IDs and historical evidence. Phase 1 rejects branch transfers for clients with visits until the reviewed historical workflow exists.

Phase 1 rollback disables the branch feature switch while retaining the additive schema/data. Once Phase 2 restricted users exist, reverting to agency-only authorization would broaden access: keep a tested branch-aware release or pause affected access while repairing it. No destructive automatic rollback.

## Acceptance and remaining decisions

Required synthetic tests: atomic/retried default creation; single-branch compatibility; selected/ALL/future-branch grants; cross-agency/cross-branch denial through direct IDs, counts, searches, exports, signed files, jobs and RLS; revoked/pending/invited membership; shared-resource deduplication/redaction; conversion; transfer/clock-in/posting races; caregiver eligibility and cross-branch overtime; EVV timezone/DST; scoped invoice corrections/subtotals; cache invalidation; aggregate reconciliation; and baseline/10x query budgets. Audit branch/default/grant/transfer changes through existing audit boundaries without PHI or secret contents. Reuse the existing sensitive-field cipher if new data actually needs encryption; no new provider/key scheme is proposed.

Phase 2 program authorization acceptance must also show that branches can browse the same catalog while agency enrollment creation selects one/several authorized branches, coordinator document/mutation access respects the enrolled branch set, and agency administrators see all agency enrollments. Sharing an enrollment must not duplicate charges or expose other-branch protected details. The detailed policy for shared application documents remains a design decision before implementation.

Run focused unit/repository/RLS tests, TypeScript, lint, build and affected Playwright workflow/accessibility checks during implementation, using synthetic data only. Capture UI before/after where applicable and report every skipped check. Phase 1 implementation checks and their limits are recorded in the rollout runbook; the broader operational cases below remain Phase 2 acceptance.

Remaining Phase 2 decisions (Phase 1 uses `company_owner` for an agency administrator and existing active membership):

1. Confirm agency-admin role mapping, who manages grants/defaults/transfers, and financial capability restrictions.
2. Define legal billing identity, mixed-branch invoices, rate/expense allocation, payroll/report-day semantics and any EVV provider identifiers.
3. Define branch-specific enrollment approval/license/service-area rules and protected-document access for a shared application.
4. Define transferred-client historical notes/docs versus visit access, safe in-progress handover and retirement prerequisites.
5. Define selected versus ALL eligibility for caregivers/programs and approve initial personnel/resource mapping. Coordinator ALL behavior is already confirmed.

Phase 1 was explicitly resumed by the user on November 24 and is implemented locally on the dedicated feature branch. Review the runbook before operator-controlled database execution or deployment. Phase 2 does not advance automatically.
