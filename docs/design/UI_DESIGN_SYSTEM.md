# MyCareSight UI Design System

Status: Step 1 governance and architecture documentation

Last reviewed: 2026-10-16

Source assessment: [UI Design System and Cross-Portal Consistency Audit](../audits/ui-design-system-audit.md)

This document defines how MyCareSight should govern its web user interface while preserving application behavior. It distinguishes what exists today from proposals that require future approval. It does not authorize implementation or imply that proposed tokens or components already exist.

## Status labels

- **Implemented** means the repository currently contains and uses the described foundation.
- **Partially implemented** means a shared foundation exists, but adoption or behavior is incomplete.
- **Proposed** means a future direction that requires an approved implementation batch.
- **Known exception** means a deliberate case that may remain outside the common pattern.
- **Deferred decision** means evidence or explicit approval is required before choosing an implementation.

## A. Existing architecture

### Current styling technologies

| Area | Status | Current implementation |
|---|---|---|
| Styling framework | **Implemented** | Tailwind CSS 3 is the active styling system. Application styles combine utility classes with [`src/app/globals.css`](../../src/app/globals.css). |
| Font | **Implemented** | Inter is loaded through `next/font` in [`src/app/layout.tsx`](../../src/app/layout.tsx). The root currently uses 14px; Step 1 does not change it. |
| Component styles | **Implemented** | Most visual decisions live in component-local Tailwind class strings. Some screens also use inline style objects. |
| Additional UI framework | **Known exception** | MUI dependencies are present, but the audit found no active source imports. Tailwind remains the application UI foundation. |

### Existing design tokens and theme mechanism

The current theme exposes `--brand`, `--brand-hover`, `--brand-subtle`, `--sidebar-bg`, and `--content-bg` in [`src/app/globals.css`](../../src/app/globals.css). Tailwind registers the first three as brand colors in [`tailwind.config.ts`](../../tailwind.config.ts).

Platform and agency branding is converted to runtime CSS variables. [`buildBrandingStyleVars`](../../src/lib/color-utils.ts) provides the shared conversion used by the admin and expert layouts. Agency and caregiver layouts currently assemble similar values locally. This is a useful white-label boundary, although direct palette utilities still limit its reach.

Status: **Partially implemented.** Primary branding and shell colors are centralized; semantic text, surface, border, focus, feedback, typography, spacing, density, radius, and elevation roles are not yet a complete token system.

### Existing shared components

The repository already provides useful shared foundations:

- Buttons: [`PrimaryButton`](../../src/components/ui/PrimaryButton.tsx), currently the canonical standard-button foundation.
- Page structure: [`PageHeader`](../../src/components/ui/PageHeader.tsx), [`SectionCard`](../../src/components/ui/SectionCard.tsx), and [`StatCard`](../../src/components/ui/StatCard.tsx).
- Status and navigation: [`Badge`](../../src/components/ui/Badge.tsx), [`StatusBadge`](../../src/components/ui/StatusBadge.tsx), and [`Tabs`](../../src/components/ui/Tabs.tsx).
- Table controls: [`SearchInput`](../../src/components/ui/SearchInput.tsx), [`FilterSelect`](../../src/components/ui/FilterSelect.tsx), [`SortableColumnHeader`](../../src/components/ui/SortableColumnHeader.tsx), [`TablePagination`](../../src/components/ui/TablePagination.tsx), [`RecordActionsMenu`](../../src/components/ui/RecordActionsMenu.tsx), and [`useTableState`](../../src/hooks/useTableState.ts).
- Form inputs: [`EmailInput`](../../src/components/ui/EmailInput.tsx) and [`PhoneInput`](../../src/components/ui/PhoneInput.tsx), supported by React Hook Form, Zod, and shared validation schemas.
- Shell and feedback: [`AppHeader`](../../src/components/ui/AppHeader.tsx), [`AppSidebar`](../../src/components/ui/AppSidebar.tsx), [`Modal`](../../src/components/Modal.tsx), [`LoadingSpinner`](../../src/components/LoadingSpinner.tsx), and the shared Sonner toaster.

Status: **Partially implemented.** These components are established but are not consistently used across all screens. Some also have documented accessibility gaps that are deferred to separately approved work.

### Shared portal layouts

[`AdminLayout`](../../src/components/AdminLayout.tsx), [`ExpertDashboardLayout`](../../src/components/ExpertDashboardLayout.tsx), [`DashboardLayout`](../../src/components/DashboardLayout.tsx), and [`StaffLayout`](../../src/components/StaffLayout.tsx) reuse `AppHeader` and `AppSidebar` for the authenticated portals. They preserve role-specific navigation and capability behavior while sharing the shell.

Status: **Implemented.** Some shell state, spacing, and branding assembly remain duplicated, but the common navigation architecture is in place.

### Existing button, table, and form standards

- **Buttons — partially implemented:** `PrimaryButton` supports primary, secondary, danger, and ghost variants, sizes, icons, loading, and focus styles. Native styled buttons remain common.
- **Tables — partially implemented:** [`src/components/ui/TABLES.md`](../../src/components/ui/TABLES.md) documents state, toolbar, sorting, action, status, empty-state, and pagination patterns. Adoption varies by table, and report/detail tables may appropriately remain specialized.
- **Forms — partially implemented:** newer forms use React Hook Form, Zod resolvers, shared schemas, inline field errors, and `noValidate`. Older forms use local state or repeated field markup. The mandatory behavioral rules remain in [`AGENTS.md`](../../AGENTS.md#forms-and-validation).
- **Dialogs — partially implemented:** the shared `Modal` provides sizing, Escape handling, backdrop behavior, a sticky header, and body-scroll locking. Complete dialog semantics and focus lifecycle are not implemented and require separate approval.

## B. Recommended target architecture

Everything in this section is **proposed** unless marked otherwise. Each implementation slice requires the approval and validation gates in the [implementation roadmap](UI_IMPLEMENTATION_ROADMAP.md).

### Semantic design tokens and foundations

Define application-owned semantic roles for:

- Canvas, surface, elevated surface, text, muted text, border, and focus.
- Primary and secondary actions plus destructive, success, warning, and informational states, including foreground and subtle states.
- Page title, section title, body, label, helper, caption, table, and numeric metric typography.
- Standard control heights, spacing, radii, elevation, content width, shell dimensions, and standard or compact density.
- Responsive breakpoints and layout policies where Tailwind defaults do not express application intent.

The first token implementation should preserve current rendered values. A root-font or broad visual change must be proposed and approved separately.

### Controlled component variants

Shared components should express intentional choices through documented variants instead of copied class strings. Examples include primary/secondary/danger/ghost buttons, standard/compact tables, normal/touch-sized controls, and default/elevated surfaces.

Variants should describe presentation and interaction mechanics. Feature code remains responsible for permissions, domain state, data, and workflow decisions.

### Shared primitives

The likely future primitive set is:

- `Button`, evolved compatibly from `PrimaryButton`, plus an explicit icon-button convention.
- An accessible dialog evolved from `Modal` with naming, focus management, and return-focus behavior.
- `FormField`, label, input, select, textarea, help, and error structures that compose existing behavioral inputs.
- Existing page headers, cards, tabs, badges, and status badges, hardened rather than replaced.
- Consistent inline/page loading, empty, error, and form-summary feedback.
- Composable table shell, toolbar, empty state, sortable button header, pagination, and density variants.

Status: **Deferred decision.** Names and public APIs must be validated against actual consumers before implementation. No proposed primitive should be described as present until merged and adopted.

### Portal-specific extensions

Portal-specific presentation should extend the shared system only where the workflow benefits:

- Caregiver workflows may use larger touch targets, stronger task progression, and mobile-first layouts.
- Licensing and agency management may use standard or compact data tables according to information density.
- Authentication and public pages may keep a distinct visual presentation while sharing controls, tokens, validation, and accessibility mechanics.
- FullCalendar, TipTap, charts, and domain visit states may retain documented adapters.

These are **known exceptions**, not permission to duplicate ordinary buttons, fields, cards, or dialogs.

### Theme and white-label boundaries

The target boundary separates:

1. Stable global semantic foundations.
2. Validated tenant theme inputs.
3. Controlled component variants.

Tenant branding may change approved appearance values only. It must never alter permissions, tenant scope, data access, workflow, validation, or business behavior. Contrast validation and safe fallback colors are required before expanding tenant-controlled theme inputs.

Status: **Proposed.** Step 1 makes no theme implementation changes.

## C. Component standards

| Category | Current standard | Future direction and limits |
|---|---|---|
| Buttons | `PrimaryButton` is canonical for standard actions. Use its current variants rather than duplicating styles. | Evolve compatibly only after consumer inventory and approval. Specialized tabs, menus, calendar cells, and editor controls may remain native controls. |
| Tables | Follow `TABLES.md` and reuse its hook and controls where the table needs those behaviors. | Add composable structure and density choices without changing feature-owned filters, sort rules, pagination, row actions, or data semantics. |
| Forms | Use React Hook Form, shared Zod schemas, inline errors, server field mapping, and shared phone/email inputs as required by `AGENTS.md`. | Standardize label/help/error/layout mechanics without changing validation or submission behavior. |
| Dialogs | Prefer the existing shared `Modal` when it fits; avoid new manual shells. | Dialog naming, focus containment, initial focus, Escape behavior, and focus return are separate accessibility work with focused tests. |
| Cards | `SectionCard` and `StatCard` are the existing foundations. | Validate variants against real dashboard/detail needs before wider adoption; do not flatten specialized workflow panels into generic cards. |
| Page headers | `PageHeader` is the existing reusable header. | Establish one meaningful H1 owner per route and a consistent title/action layout without changing navigation. |
| Navigation | Authenticated portals reuse `AppHeader` and `AppSidebar`. | Preserve role/capability visibility and destinations. Presentation work cannot move authorization decisions into the browser. |
| Status indicators | Use `Badge` for categories and `StatusBadge` for general lifecycle state. | Centralize common status mappings; preserve documented visit/clinical mappings when they carry distinct operational meaning. |
| Loading, empty, and error states | Shared toaster and spinner exist; screen-level states vary. | Introduce consistent, accessible patterns only after behavior and announcement semantics are defined. Do not expose internal errors or PHI. |

## D. Component ownership

### Shared UI components own

- Presentation, semantic markup, and supported visual variants.
- Generic keyboard behavior and ARIA mechanics.
- Reusable focus, loading, disabled, and responsive presentation.
- Stable props that describe presentation or generic interaction callbacks.

### Feature and domain code own

- Data fetching, database and storage access, caching, and persistence.
- Authentication, authorization, roles, capabilities, tenant scope, and PHI disclosure rules.
- Business calculations, validation rules, workflow state, and audit requirements.
- Domain-specific columns, filter meaning, sort semantics, status meaning, and navigation destinations.
- Mutation orchestration, server error interpretation, and route revalidation.

A shared primitive must not accept client-provided authority or silently make business decisions. Feature code may compose primitives into a domain component without moving domain logic into the UI layer.

## E. Migration philosophy

Existing screens do not need to be rewritten to reach 100% design-system adoption. Stability has greater value than uniformity when a working screen contains complex licensing, scheduling, EVV, payroll, billing, document, or PHI workflows.

Migration should proceed in small, independently reversible batches:

1. Improve shared foundations while preserving public APIs and rendered values.
2. Prove each pattern on one representative screen with synthetic data.
3. Migrate high-traffic or visibly inconsistent screens when benefit justifies risk.
4. Update lower-priority screens opportunistically during normal maintenance.
5. Stop when remaining differences are cosmetic or the regression risk exceeds the practical benefit.

Known exceptions must be documented. Deferred decisions must remain explicitly deferred until evidence and approval exist. Each phase ends with a `PROCEED`, `PROCEED SELECTIVELY`, or `STOP` recommendation and requires explicit approval before the next phase starts.
