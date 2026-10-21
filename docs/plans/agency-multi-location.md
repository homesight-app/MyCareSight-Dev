# Agency Multi-Location Plan

Status: deferred design; implementation not authorized  
Recorded: 2026-10-16  
Prerequisite: successful production migration and release-pipeline stabilization

## Objective

Add mandatory agency locations as a scope below the existing agency boundary:

- every agency has one or more locations;
- every client belongs to exactly one location;
- agency owners/administrators can see all clients in their agency and filter by location;
- each care coordinator is assigned to one or more locations and can see clients only in those locations;
- each caregiver is associated with one or more locations;
- caregiver assignment and open-shift broadcast candidates must be associated with the visit's location; and
- no client, coordinator, or caregiver becomes operational until the required location relationship exists.

Location narrows access inside an agency. It must never replace or weaken the existing `agency_id` tenant boundary.

## Architectural fit

The current system authorizes agency roles through `user_profiles`, exact active `user_agency_roles` membership, server-side actor context, explicit `agency_id` predicates, and PostgreSQL RLS. Location scope should extend those same application-owned authorization and repository boundaries rather than be inferred in pages or client components.

The most affected existing areas are patient queries and actions, caregiver directories and candidate ranking, schedule assignment, shift offers/broadcasts, visit execution, reporting, caching, and audit. Relevant implementation anchors include:

- [`src/app/actions/patients.ts`](../../src/app/actions/patients.ts) and [`src/lib/supabase/query/patients.ts`](../../src/lib/supabase/query/patients.ts);
- [`src/lib/repositories/visit-caregiver-candidates.ts`](../../src/lib/repositories/visit-caregiver-candidates.ts) and [`src/app/actions/visit-candidates.ts`](../../src/app/actions/visit-candidates.ts);
- [`src/lib/repositories/visit-shift-offers.ts`](../../src/lib/repositories/visit-shift-offers.ts) and [`src/app/actions/visit-shift-offers.ts`](../../src/app/actions/visit-shift-offers.ts);
- [`src/app/actions/schedule-assignment-requests.ts`](../../src/app/actions/schedule-assignment-requests.ts);
- [`src/lib/repositories/caregiver-visit-execution.ts`](../../src/lib/repositories/caregiver-visit-execution.ts);
- [`scripts/migrations/014-scheduling-lifecycle-access.sql`](../../scripts/migrations/014-scheduling-lifecycle-access.sql), [`scripts/migrations/020-visit-shift-offers.sql`](../../scripts/migrations/020-visit-shift-offers.sql), and the patient RLS controls in [`scripts/rls-patients-enable.sql`](../../scripts/rls-patients-enable.sql).

The live production Supabase schema and live target Neon schema remain authoritative. Before any SQL is drafted, both must be inspected directly as required by [`AGENTS.md`](../../AGENTS.md); historical schema files are design evidence only.

## Proposed data model

Exact names and constraints require live-schema verification, but the preferred normalized shape is:

| Relation | Purpose | Core integrity |
|---|---|---|
| `agency_locations` | Stable location identity and operational settings for an agency | `id`, `agency_id`, stable `code`, display `name`, timezone, status, address/contact metadata, timestamps; unique `(agency_id, code)` |
| `patients.location_id` | The client's one current operational location | Required foreign key after backfill; location must belong to the same agency as the patient |
| `care_coordinator_location_assignments` | Many-to-many coordinator scope | Unique active assignment per coordinator/location; both records must belong to the same agency; effective/status fields if history is required |
| `caregiver_location_assignments` | Many-to-many caregiver eligibility | Unique active assignment per caregiver/location; both records must belong to the same agency; effective/status fields if history is required |
| `scheduled_visits.location_id` | Location snapshot used for assignment, execution, reporting, and audit | Required for new visits and copied from the client at scheduling time; same agency as the visit and patient |

Separate coordinator and caregiver assignment relations are preferred over a polymorphic subject table. Their foreign keys, lifecycle rules, and authorization differ, and explicit relations make invalid cross-agency assignments harder to represent.

`scheduled_visits.location_id` should be a persisted snapshot, not a runtime join to the client's current location. A client transfer must not silently rewrite completed or in-progress visit history. The approved transfer workflow should decide whether unstarted future visits move to the new location or remain where originally scheduled.

## Authorization rules

| Actor | Read scope | Write/assignment scope |
|---|---|---|
| Platform administrator | Existing platform-authorized scope | Existing platform-authorized scope; location does not create implicit PHI access |
| Agency owner (`company_owner`) | All active locations for the actor's active agency membership, with an optional location filter | May configure locations and location assignments, subject to capability controls and audit |
| Care coordinator | Union of explicitly active assigned locations in the actor's active agency | May operate only on clients, visits, and caregivers within that union; cannot broaden scope by submitting a location ID |
| Caregiver (`staff_member`) | Their assigned visits and permitted open shifts within actively assigned locations | Visit execution remains assignment-bound; location association is an additional eligibility condition |

Every protected operation must load the authoritative client/visit/caregiver and derive its agency and location server-side. A caller-provided `agency_id`, `location_id`, patient ID, visit ID, or caregiver ID is an identifier to validate, never authorization proof.

Location predicates must be enforced in centralized repositories/services and in RLS for PHI tables as defense in depth. A query that omits location scope must fail closed for a coordinator. Agency owners should receive all-location scope from the authorization layer instead of being assigned synthetic rows to every location.

## Mandatory-location business rules

1. Creating an agency must create or require its first location in the same workflow and transaction boundary.
2. A client cannot become active or be scheduled without one location.
3. A care coordinator cannot become active without at least one active location assignment.
4. A caregiver cannot become active/assignable without at least one active location assignment.
5. A visit inherits the client's location when it is created. The visit's location controls candidate selection and outreach.
6. Direct assignment, assignment requests, and broadcasts must reject a caregiver without an active assignment to that location, even if the caller bypasses the UI filter.
7. Deactivating a location must be blocked while it has active clients, active personnel assignments, or actionable future visits, unless an explicit transfer workflow resolves them.
8. Location transfers and assignment changes require identifier-only audit events. PHI, free-text notes, and addresses must not be copied into audit details.

## UI and workflow implications

The agency-facing web application is required before mobile integration:

- location setup and lifecycle management;
- mandatory first-location setup during onboarding;
- location assignment controls for coordinators and caregivers;
- client create/edit/transfer workflows;
- agency-owner filters across clients, schedules, caregivers, reports, and operational queues;
- coordinator filters restricted to assigned locations; and
- clear empty/error states when no eligible caregiver exists at the visit location.

The UI filter is only a convenience. Repository and database authorization must return the same bounded set if a request is constructed manually.

## Production-safe migration sequence

Production currently has real agencies but no agency administrators, care coordinators, or caregivers. That materially lowers personnel-assignment risk, but agency and client data must still be treated as production data.

1. **Verify live schemas and data.** Inventory agencies, clients, future visits, existing role rows, caregiver rows, and any source concept resembling branches or offices. Determine whether any agency already operates multiple real locations.
2. **Add compatibility structures.** Create location and assignment tables and add nullable location references. Do not change existing query behavior yet.
3. **Create deterministic defaults.** Create one inactive/configuration-pending or clearly named `Primary` location for each existing agency only when the business cannot provide a verified mapping. Do not infer real branch identity from an address or company name.
4. **Backfill clients and visits.** Assign each existing client to an approved location. Snapshot the appropriate location on existing visits while preserving historical facts. Quarantine ambiguous rows rather than guessing.
5. **Validate integrity.** Check same-agency foreign keys, counts, orphan rows, future visit mappings, and candidate eligibility. Add indexes supporting `(agency_id, location_id)` and assignment lookups based on measured query plans.
6. **Introduce location-aware authorization.** Update central actor scope, repositories, services, RLS, cache keys/tags, and audit. Keep all-location behavior for owners and fail-closed behavior for coordinators.
7. **Release agency configuration UI.** Require each real agency to confirm its location setup before external users or new clients are activated.
8. **Enforce mandatory constraints.** Set required columns `NOT NULL` and enable activation/scheduling guards only after reconciliation proves no unresolved rows remain.
9. **Enable assignment and broadcast filtering.** Apply location as a server-side eligibility requirement in direct assignment, requests, candidate ranking, and shift offers.
10. **Run synthetic acceptance, then controlled production rollout.** Test role, tenant, and location denial paths before granting external access.

Use additive expand-and-contract migrations. Applied migrations must remain immutable; corrections use a new migration. Keep a rollback path by delaying `NOT NULL` and enforcement until the new read/write paths have passed acceptance.

## Acceptance matrix

The implementation is not complete until automated and manual tests prove:

- an owner can see and filter every location in their agency and no other agency;
- a coordinator assigned to locations A and B can see A/B clients and visits but cannot read or mutate location C by URL, action, API, repository, or direct database policy path;
- a caregiver associated with A cannot be assigned, requested, or broadcast for B;
- assigning a caregiver valid for multiple locations does not duplicate candidates or notifications;
- a client has exactly one current location;
- a client transfer preserves historical visit location and applies the approved future-visit rule;
- inactive or configuration-pending locations cannot receive new operational records;
- agency, role, membership, and location changes revoke or refresh effective authorization promptly;
- reports and caches cannot leak data across locations after filter changes; and
- audit events identify actor, agency, location, resource, action, and time without PHI content.

## Decisions required before implementation

1. Confirm that “agency admin” maps to the existing `company_owner` role, or approve a distinct future role.
2. Decide how client transfers affect unstarted future visits and recurring schedules.
3. Decide whether a temporary cross-location emergency assignment is allowed. If allowed, it needs a reason, expiry, manager authorization, and immutable audit; the safer default is no override.
4. Define whether coordinators and caregivers may be assigned to inactive/configuration-pending locations for advance setup.
5. Define location-level timezone, service-area, billing, licensing, and notification ownership. Only values that change behavior belong in this model.
6. Decide whether a one-location agency may hide location filters while still storing and enforcing the required location relationship.

## Resume gate

Resume this plan only after the production migration in [Production Environment, Data Migration, and Release Promotion Plan](production-environment-and-promotion.md) has completed its stabilization gate. Re-run the live schema and authorization audit at that time, then produce a reviewed schema proposal and phased implementation slice. Mobile scheduling and caregiver-assignment endpoints should wait for this location model.

