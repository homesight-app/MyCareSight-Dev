# Initiative delivery register

Updated 2026-11-24: the user confirms the migration fixes work and explicitly starts agency branches on a dedicated local feature branch. [Phase 1 rollout](agency-branches-rollout.md) is now active for next week's agency-administrator onboarding using leads, clients and HomeSights services. Coordinator branch restrictions and care operations/finance are Phase 2. Mobile remains deferred.

This explicit authorization supersedes the historical hold and resume order below. Database scripts remain operator-applied; no agent push, deployment or live database mutation is authorized.


Status: planning only  
Recorded: 2026-10-16; updated 2026-11-21

## November 21 update: migration stabilization before agency branches

The active [Agency Branches plan](agency-multi-location.md) now uses branch terminology and includes lead/client defaults, many-to-many caregiver/user/agency-enrollment associations, EVV and financial history, complete authorization coverage, bounded queries and phased rollback. Confirmed decisions: coordinator ALL includes future branches; client transfer keeps existing visits unless explicitly reviewed/transferred; shared programs mean agency-enrolled programs/license applications, not global catalog definitions.

Further clarification: every branch can browse the offered global catalog; an agency enrollment may cover one/several branches, with agency-admin visibility across the agency. Schema knowledge should come from an operator-generated, reviewed schema-only export without agent database credentials. The agent prepares future scripts; the user reviews/applies them directly. No live schema login, migration execution or change to existing deployment automation is authorized by this planning choice.

Confirmed shared-enrollment workflow: one application associated with several branches retains shared progress, approval status and common documents; use separate applications when independent workflows are needed. This decision does not authorize implementation or resolve all shared-state mutation permissions.

Initial adopter scope clarified: agencies initially use leads and clients without scheduling. Prioritize Agency Info and Branches under Configuration, followed by branch-scoped lead/client workflows; scheduling/EVV/finance comes later behind capability/readiness gates. Moving Company Details out of the personal profile and separating legal agency fields from branch offices is a saved design proposal, not an implemented UI change. Reuse the existing editor/action boundaries and lazy-load independent configuration sections.

User also requests removal of the agency-facing Branding section from the planned Configuration experience. Remove its editor/navigation and configuration-only loading during implementation; preserve existing rendered appearance, stored assets and platform branding. No immediate application change or destructive cleanup is authorized by this planning update.

Proposed later care-operations scope: agency-default schedule/pay/mileage policies with effective-dated branch overrides and visible inheritance. Preserve worker/employer-wide overtime, financial history, actual-work-location considerations and separation of reimbursement from client billing. This is not part of leads/client-only branch setup and is not an approved payroll-calculation change; confirm policy/jurisdiction requirements before implementation.

Reserve the week of November 23 for migration bugs and stabilization. Resume only on explicit user approval, on a separate feature branch from current main; no date-based automatic start. No confirmed development database connection was available for this revision. Live development schema metadata and environment identity must be verified before migration design. Older production/Supabase assumptions below are historical sequencing context, not current environment evidence. Planning does not authorize implementation or deployment.

This register preserves two approved planning threads while the production environment and migration path are designed. It does not authorize implementation, database changes, production access, data transfer, deployment, or the use of real data in UAT.

## Resume order

1. Complete and approve the production environment, migration, and code-promotion plan in [Production Environment, Data Migration, and Release Promotion Plan](production-environment-and-promotion.md).
2. Provision and validate the new production environment, migrate the current production workload under a separately approved runbook, and complete a defined stabilization period.
3. Resume [Agency Multi-Location Plan](agency-multi-location.md). This must precede mobile scheduling and caregiver-assignment integration because location becomes part of authorization and caregiver eligibility.
4. Resume the existing [Mobile Backend Readiness Assessment](../mobile-backend-readiness.md), updating its conclusions for the production architecture and the approved location model before implementation.

## Deferred initiative 1: agency multi-location

The required outcome is that every agency has at least one location; every client belongs to exactly one location; care coordinators and caregivers may be assigned to one or more locations; agency owners can view and filter the whole agency; coordinators can view and filter only their assigned locations; and assignment or broadcast candidates must be eligible for the visit's location.

The saved plan covers the target data model, authorization rules, staged backfill, mandatory-location gates, scheduling effects, production-safe rollout, acceptance tests, and unresolved business decisions. Phase 1 application changes and manual migration scripts are being prepared locally; no live schema has been changed.

## Deferred initiative 2: caregiver mobile integration

The existing assessment covers Today/Schedule, Open Shifts, Inbox, More, Visit Details, Clock In, Active Visit, task documentation, visit notes, Change in Condition, clock-out completion, conversation threads, notifications, EVV, audit, synchronization, and agency-facing dependencies.

Its current conclusion remains: the web backend has reusable foundations, but it is not yet a mobile API. Mobile work requires device-scoped authentication, a versioned API, actor-aware shared services, replay-safe mutations, notification infrastructure, and additional agency workflows. No implementation has been authorized.

## Dependency rule

Neither deferred initiative should be implemented while production still depends on manual local file copying or an unverified list of "missing" migrations. The production release process must first establish a reproducible source commit, an exact migration manifest, approval evidence, and rollback procedures.

