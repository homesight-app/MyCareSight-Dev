# Task Center — Part 2 Design

Status: design only; not approved for implementation.

## Purpose

Provide each authorized user one place to manage work assigned to them or created by them, while preserving the originating workflow and tenant boundary. Part 1 keeps lead tasks in `lead_tasks` and adds explicit creator/assignee display and assignment. Part 2 should build on that behavior rather than replacing it prematurely.

## Recommended user experience

- Add a **Tasks** navigation item only after the authorization and data model below are approved.
- Default view: **Assigned to me**, pending tasks, ordered by overdue, due today, then upcoming.
- Additional views: **Created by me**, **Unassigned** (manager roles only), **Team** (manager roles only), and **Completed**.
- Filters: source area (`Lead`, `Ad Hoc`, `Service`, and future sources), due state, assignee, creator, completion state, and date range.
- Grouping: source record, such as a specific lead or service. Each row links back to its authorized source record.
- Show title, source, related record label, due date, assignee, creator, and completion state. Do not copy source-record PHI into task telemetry or audit details.
- Allow create, assign/reassign, complete/reopen, and delete only when the source workflow already permits that action.

## Architecture

### MVP approach

Create a server-only Task Center read model that normalizes existing task sources without moving data initially:

1. Query `lead_tasks` through a tenant- and role-scoped repository.
2. Add adapters for later task sources only when those workflows are approved.
3. Return a shared `TaskSummary` shape to the UI:
   - `id`, `sourceType`, `sourceId`, `sourceLabel`
   - `title`, `dueDate`, `completedAt`
   - `createdBy`, `assignedTo`
   - `canEdit`, `canAssign`, `canComplete`, `sourceHref`
4. Keep mutations in the owning domain action (for example, lead task actions). The Task Center delegates to those actions and does not duplicate business rules.

This minimizes the Part 2 blast radius and avoids a risky early migration into a universal task table.

### When to introduce a shared task table

Consider a normalized `work_tasks` table only after at least three independent task-producing workflows need the same lifecycle. If approved, use a controlled migration with:

- stable source type plus source record identifier;
- agency scope where applicable;
- creator and optional assignee foreign keys;
- due/completed timestamps and immutable creation metadata;
- source-specific authorization enforced by server repositories, with RLS as defense in depth;
- indexes for assigned pending work, creator history, agency team queues, due dates, and source grouping;
- an append-only assignment/status history or identifier-only audit events.

Avoid polymorphic foreign keys that cannot preserve referential integrity without an explicit source registry or source-specific association tables.

## Authorization and privacy

- Platform Admin/Expert tasks remain separate from agency tenant tasks.
- Agency Admin/Care Coordinator users may see only tasks for their active agency membership.
- A user may see a task only if they can access its originating record.
- Team and unassigned views require manager permissions; ordinary assignees see their own work and work they created where source access remains valid.
- Revalidate active user, role, membership, source access, and task ownership on every mutation. Never trust a client-provided agency, assignee, or source ID.
- Audit assignment, reassignment, completion/reopen, deletion, and cross-user manager actions using identifiers and transition metadata only.
- Do not place lead/client names, task titles, notes, or other PHI in logs, analytics, URLs, or notification payloads.

## Performance

- Use cursor or stable keyset pagination for large queues; avoid loading every task for an agency.
- Query creator/assignee names in the same batched read to avoid N+1 requests.
- Index the dominant queue shapes, beginning with `(assigned_to, due_date, id) WHERE completed_at IS NULL`.
- Load group labels in batches and cache only non-PHI reference data.
- Count tabs with scoped aggregate queries rather than retrieving rows for every view.

## Delivery phases

1. **Part 1 foundation (current):** owner leads, assign lead tasks, show creator/assignee, enforce scope, add audit and indexes.
2. **Read-only Task Center:** Assigned to me/Created by me with lead tasks only.
3. **Manager collaboration:** Unassigned and Team views, filters, grouping, and authorized reassignment.
4. **Ad hoc tasks:** define ownership, retention, and permitted record links before adding creation.
5. **Additional source adapters:** add Services or other workflows one at a time with focused authorization tests.
6. **Optional normalization:** evaluate `work_tasks` only after usage and lifecycle requirements are proven.

## Decisions required before implementation

- Which roles receive the Tasks menu in each portal?
- May creators edit tasks after assigning them, or only the assignee and managers?
- Who can view Team and Unassigned queues?
- Are task comments, reminders, recurrence, priority, or attachments in MVP? Recommendation: no.
- What are the retention rules for completed/deleted tasks?
- Which workflow is the first approved source after Leads?

## Acceptance criteria for a future Part 2 MVP

- Users see only authorized tasks across every filter and group.
- Assigned to me and Created by me return accurate, paginated results.
- Source links fail closed if source access is revoked.
- Reassignment and completion reuse source-domain actions and create audit evidence.
- Overdue/today calculations use one documented business time zone rule.
- Synthetic tests cover cross-agency denial, inactive membership, stale sessions, pagination, filtering, and task/source race conditions.

## Non-goals

- No Part 2 UI, navigation, universal task table, recurrence, notifications, or background jobs are included in Part 1.
- This design does not authorize a production deployment, production data migration, or PHI use in non-HIPAA environments.
