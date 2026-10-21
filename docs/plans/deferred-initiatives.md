# Deferred Initiatives Register

Status: planning only  
Recorded: 2026-10-16

This register preserves two approved planning threads while the production environment and migration path are designed. It does not authorize implementation, database changes, production access, data transfer, deployment, or the use of real data in UAT.

## Resume order

1. Complete and approve the production environment, migration, and code-promotion plan in [Production Environment, Data Migration, and Release Promotion Plan](production-environment-and-promotion.md).
2. Provision and validate the new production environment, migrate the current production workload under a separately approved runbook, and complete a defined stabilization period.
3. Resume [Agency Multi-Location Plan](agency-multi-location.md). This must precede mobile scheduling and caregiver-assignment integration because location becomes part of authorization and caregiver eligibility.
4. Resume the existing [Mobile Backend Readiness Assessment](../mobile-backend-readiness.md), updating its conclusions for the production architecture and the approved location model before implementation.

## Deferred initiative 1: agency multi-location

The required outcome is that every agency has at least one location; every client belongs to exactly one location; care coordinators and caregivers may be assigned to one or more locations; agency owners can view and filter the whole agency; coordinators can view and filter only their assigned locations; and assignment or broadcast candidates must be eligible for the visit's location.

The saved plan covers the target data model, authorization rules, staged backfill, mandatory-location gates, scheduling effects, production-safe rollout, acceptance tests, and unresolved business decisions. No schema or application change has been made.

## Deferred initiative 2: caregiver mobile integration

The existing assessment covers Today/Schedule, Open Shifts, Inbox, More, Visit Details, Clock In, Active Visit, task documentation, visit notes, Change in Condition, clock-out completion, conversation threads, notifications, EVV, audit, synchronization, and agency-facing dependencies.

Its current conclusion remains: the web backend has reusable foundations, but it is not yet a mobile API. Mobile work requires device-scoped authentication, a versioned API, actor-aware shared services, replay-safe mutations, notification infrastructure, and additional agency workflows. No implementation has been authorized.

## Dependency rule

Neither deferred initiative should be implemented while production still depends on manual local file copying or an unverified list of "missing" migrations. The production release process must first establish a reproducible source commit, an exact migration manifest, approval evidence, and rollback procedures.

