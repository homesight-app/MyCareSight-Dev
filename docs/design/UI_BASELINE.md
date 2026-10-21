# MyCareSight UI Baseline

Status: Step 1 inventory; no screenshots captured

Baseline date: 2026-10-16

Reference audit: [UI Design System and Cross-Portal Consistency Audit](../audits/ui-design-system-audit.md)

This baseline identifies representative screens for future visual and behavioral comparison. It records source-backed characteristics; it does not assert pixel-level browser behavior.

## Baseline viewports

Use the following CSS viewport widths when a safe screenshot run is approved:

Recommended widths are Desktop: 1440px, Tablet: 768px, and Mobile: 375px.

| View | Width | Purpose |
|---|---:|---|
| Desktop | 1440px | Full portal shell, wide management tables, dashboards, and dialogs |
| Tablet | 768px | Sidebar/header transitions, two-column layouts, horizontal table containment, and form wrapping |
| Mobile | 375px | Caregiver touch workflows, stacked content, navigation overlay, form keyboard space, and overflow |

Record viewport height, browser, operating system, zoom, color scheme, test identity role, route, commit, and fixture version with each capture. Use deterministic synthetic data only.

## Representative screens

### 1. HomeSights Admin dashboard

- **Route/source:** `/pages/admin`; [`src/app/pages/admin/page.tsx`](../../src/app/pages/admin/page.tsx)
- **Portal:** HomeSights Admin
- **Key UI:** five summary cards, cases-by-status chart, cases-by-state chart, shared authenticated shell.
- **Shared usage:** `AdminLayout`, `AppHeader`, and `AppSidebar`; chart components are feature-specific.
- **Known inconsistencies:** dashboard cards repeat local surface, spacing, icon, color, and type classes instead of using `StatCard`/`SectionCard`; direct blue/orange/yellow/green palettes bypass semantic theme roles.
- **Behavior to preserve:** admin authorization, application counts, progress calculations, chart grouping, and responsive card/chart ordering.
- **Regression concerns:** incorrect aggregate values, chart sizing, card wrapping at tablet width, duplicate/missing page headings, sidebar offsets, or content clipping.

### 2. HomeSights Admin management table

- **Route/source:** `/pages/admin/agencies`; [`src/app/pages/admin/agencies/page.tsx`](../../src/app/pages/admin/agencies/page.tsx) and [`src/components/AgenciesContent.tsx`](../../src/components/AgenciesContent.tsx)
- **Portal:** HomeSights Admin
- **Key UI:** agency search/status controls, sortable columns, paginated rows, record actions, agency detail navigation, and add/edit flows.
- **Shared usage:** established table controls and `PrimaryButton` are used within the feature; exact adoption must be re-inventoried before implementation.
- **Known inconsistencies:** table structure and toolbar styling are feature-owned; direct utilities coexist with shared controls; modal/form presentation may differ from other management screens.
- **Behavior to preserve:** server pagination and query parameters, filtering, sort direction, agency-admin association display, action permissions, row destinations, and all mutations.
- **Regression concerns:** off-by-one pagination, reset behavior when filters change, keyboard sorting, action-menu positioning, inactive-row legibility, mobile horizontal overflow, and stale URL state.

### 3. Licensing Expert workflow

- **Route/source:** `/pages/expert/programs`; [`src/app/pages/expert/programs/page.tsx`](../../src/app/pages/expert/programs/page.tsx), with detail work under `/pages/expert/programs/[id]`.
- **Portal:** Licensing Expert
- **Key UI:** `PageHeader`, assigned-program table, progress bar, status counts, empty state, and detail navigation.
- **Shared usage:** `PageHeader` and the shared authenticated expert shell. The table itself uses local markup rather than the complete standard table controls.
- **Known inconsistencies:** direct palette status indicators, local table header/cell rules, icon-only row navigation, and a local empty-state surface.
- **Behavior to preserve:** expert assignment scope, progress calculation, application filtering, item status meaning, agency/application disclosure, and detail route.
- **Regression concerns:** progress math, status color as the only cue, table overflow, accessible name for row navigation, and preserving expert-only data visibility.

### 4. Agency Admin dashboard

- **Route/source:** `/pages/agency`; [`src/app/pages/agency/page.tsx`](../../src/app/pages/agency/page.tsx)
- **Portal:** Agency Admin / company owner
- **Key UI:** staff and certification summary cards, recent notifications, expiration information, links to agency workflows, and the branded agency shell.
- **Shared usage:** `DashboardLayout`, `AppHeader`, `AppSidebar`, notification repository output, and role-aware navigation.
- **Known inconsistencies:** cards and status colors are local; card sizing differs from admin/caregiver dashboards; typography and shadows use repeated utility strings.
- **Behavior to preserve:** agency-scoped reads, certification counts and expiry calculations, notification unread state, link destinations, capability/role visibility, and date formatting.
- **Regression concerns:** cross-agency disclosure, count differences, altered notification behavior, small-text readability, card wrapping, and tenant branding contrast.

### 5. Agency Admin management table

- **Route/source:** `/pages/agency/user-management`; [`src/app/pages/agency/user-management/page.tsx`](../../src/app/pages/agency/user-management/page.tsx), [`src/components/AgencyUserManagementTabBar.tsx`](../../src/components/AgencyUserManagementTabBar.tsx), [`src/components/AgencyPeopleTab.tsx`](../../src/components/AgencyPeopleTab.tsx), and [`src/components/StaffManagementClient.tsx`](../../src/components/StaffManagementClient.tsx)
- **Portal:** Agency Admin and Care Coordinator according to current permissions
- **Key UI:** role/person tabs, search and status filters, paginated records, status indicators, action menus, and user/staff forms.
- **Shared usage:** portions use shared button, table, status, phone/email, and action foundations; feature-level implementations remain mixed.
- **Known inconsistencies:** multiple table/status/form patterns within the same management area; local buttons and field layouts remain; dense content depends on small type.
- **Behavior to preserve:** role and membership rules, active/inactive distinctions, agency scope, server pagination/search, invitations and deactivation, caregiver linking, validation, cache revalidation, and audit behavior.
- **Regression concerns:** privilege or tenant leakage, actions appearing for the wrong role, status filter changes, form error loss, table overflow, modal focus, and destructive-action labeling.

### 6. Agency client/detail screen

- **Route/source:** `/pages/agency/clients/[id]`; [`src/app/pages/agency/clients/[id]/page.tsx`](../../src/app/pages/agency/clients/%5Bid%5D/page.tsx) and [`src/components/ClientDetailContent.tsx`](../../src/components/ClientDetailContent.tsx)
- **Portal:** Agency Admin / Care Coordinator
- **Key UI:** a large, multi-section client record with tabs, forms, care information, schedules, documents, incidents, billing-related content, and modal workflows.
- **Shared usage:** shared controls appear throughout, alongside many feature-local patterns.
- **Known inconsistencies:** the main client component is very large and contains local versions of cards, fields, buttons, badges, tabs, and overlays. It is not a safe reference implementation for a broad rewrite.
- **Behavior to preserve:** every tenant and client authorization check, PHI disclosure boundary, tab state, field validation, mutations, uploads/downloads, schedules, audits, and navigation.
- **Regression concerns:** highest UI migration blast radius; hidden section coupling, stale form state, wrong record IDs, upload behavior, responsive tab overflow, focus across nested dialogs, and accidental PHI in screenshots.

### 7. Caregiver dashboard

- **Route/source:** `/pages/caregiver`; [`src/app/pages/caregiver/page.tsx`](../../src/app/pages/caregiver/page.tsx)
- **Portal:** Caregiver / staff member
- **Key UI:** `PageHeader`, certification summary cards, expiring items, license/certification tables or lists, status badges, and caregiver navigation.
- **Shared usage:** `PageHeader`, `StatusBadge`, and the shared staff shell.
- **Known inconsistencies:** locally composed dashboard cards, direct status palettes, dense desktop-oriented license presentation, and spacing that differs from other dashboards.
- **Behavior to preserve:** caregiver identity resolution, certification/application merging, expiry calculations and order, document counts, route destinations, and caregiver-only access.
- **Regression concerns:** mobile readability, touch target size, expiry/date calculations, duplicate records, shell spacing, and status meaning.

### 8. Caregiver visit execution

- **Route/source:** `/pages/caregiver/my-care-visits/[visitId]`; [`src/app/pages/caregiver/my-care-visits/[visitId]/page.tsx`](../../src/app/pages/caregiver/my-care-visits/%5BvisitId%5D/page.tsx) and [`src/components/CaregiverVisitExecutionContent.tsx`](../../src/components/CaregiverVisitExecutionContent.tsx)
- **Portal:** Caregiver / staff member
- **Key UI:** visit identity and timing, client/location summary, clock-in/out, task completion, notes, loading and mutation feedback, and feature-locked/not-found behavior.
- **Shared usage:** shared staff shell and loading/feedback conventions; most execution presentation is domain-specific by design.
- **Known inconsistencies:** workflow-specific buttons and panels do not fully share admin control styles; this may be an intentional touch-oriented variant. Feedback treatment varies across operations.
- **Behavior to preserve:** authenticated caregiver and capability checks, assigned-visit scope, visit state transitions, EVV coordinates/timestamps, task state, notes, idempotent retry behavior, audit events, and server-authoritative outcomes.
- **Regression concerns:** critical workflow. Test location permission states, double submission, offline/network failure where supported, loading lockouts, keyboard/touch use, clock status, task persistence, narrow-screen sticky controls, and no PHI in evidence.

### 9. Authentication/login

- **Route/source:** `/pages/auth/login`; [`src/app/pages/auth/login/page.tsx`](../../src/app/pages/auth/login/page.tsx)
- **Portal:** Authentication
- **Key UI:** responsive two-column brand treatment, email/password form, remember-me control, validation and server errors, loading state, password recovery link, and role-based post-login redirect.
- **Shared usage:** React Hook Form and Zod; the screen uses a distinct public/auth presentation rather than the portal shell.
- **Known inconsistencies:** local form controls and button styles, inline external background-image styling, direct gradient/palette values, animated decoration, and separate mobile/desktop headings.
- **Behavior to preserve:** credential submission, sanitized error behavior, reset-success handling, empty credentials, Auth.js session creation, and role-based destinations.
- **Regression concerns:** authentication failure handling, password-manager/autofill behavior, browser back/refresh, focus and error announcement, reduced motion, contrast over the image, small-screen keyboard overlap, and no credentials in screenshots/logs.

### 10. Representative form and modal

#### Agency form

- **Component/workflow:** [`src/components/AddAgencyModal.tsx`](../../src/components/AddAgencyModal.tsx), opened from agency administration.
- **Portal:** HomeSights Admin
- **Key UI:** multi-field agency form, required indicators, shared phone/email behavior where applicable, field/server errors, submit loading, and add/edit presentation.
- **Shared usage:** `PrimaryButton`, React Hook Form, Zod resolver, and existing validation conventions. The overlay/shell should be confirmed before any migration because it is not the shared `Modal` reference.
- **Known inconsistencies:** repeated field and overlay classes and incomplete alignment with the shared dialog foundation.
- **Behavior to preserve:** create/edit mode, default values, server action contract, validation, field error mapping, close/reset behavior, and agency-admin selections.
- **Regression concerns:** stale values after reopen, error focus, double submit, close during submit, keyboard containment, and server-field error visibility.

#### Shared-modal reference

- **Component/workflow:** [`src/components/VisitShiftOfferModal.tsx`](../../src/components/VisitShiftOfferModal.tsx), used to publish visit shift offers.
- **Portal:** Agency care operations
- **Key UI:** shared `Modal`, `PrimaryButton`, recipient choice, deadline/note fields, validation, and submit feedback.
- **Shared usage:** `Modal`, `PrimaryButton`, React Hook Form, Zod, and a shared domain schema.
- **Known inconsistencies:** it inherits the current shared modal's missing dialog/focus lifecycle and local form-field styling.
- **Behavior to preserve:** authorized visit context, eligible recipient logic, validation, offer publication, notification/audit behavior, close/reset behavior, and no free-text content in audit details.
- **Regression concerns:** critical scheduling workflow; recipient mismatch, duplicate offer, deadline parsing, focus trapping/return, error association, and accidental note disclosure.

## Screenshot status and safe capture plan

No screenshots were captured in Step 1. The repository has Playwright coverage, but this review did not verify an already-running, deterministic, zero-write environment with synthetic identities for every portal. Existing end-to-end setup and protected workflows may authenticate or mutate data. The authorized scope prohibits changing configuration, creating users, seeding data, or modifying application code, so launching a new capture flow would not meet the evidence and safety requirements.

When a safe environment is approved and already provisioned:

1. Confirm the environment contains synthetic, non-PHI records only and identify read-only routes or resettable fixtures.
2. Record the commit and fixture version; redact no data after capture as a substitute for safe source data.
3. Capture all baseline screens at 1440px, 768px, and 375px with consistent heights and browser settings.
4. Capture closed and open states for the representative form/modal, using validation-only inputs that do not submit or persist.
5. Store approved images under a dedicated documentation baseline path with no credentials, tokens, query secrets, or identifying data in filenames or metadata.
6. Repeat after each visual batch and compare layout, content hierarchy, focus, overflow, and state presentation. Behavioral checks remain required; screenshots alone do not prove functionality or accessibility.

## Baseline limitations

- This inventory is code-verified but not a live visual-conformance result.
- Responsive wrapping, computed contrast, zoom, operating-system text scaling, screen-reader output, virtual-keyboard overlap, and touch ergonomics remain unverified.
- Dynamic data shape can materially change tables, charts, and empty states. Future comparisons need deterministic synthetic fixtures.
- The global 14px root remains part of the current baseline. Changing it is a separate, high-blast-radius decision.
