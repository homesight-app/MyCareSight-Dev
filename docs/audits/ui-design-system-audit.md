# MyCareSight UI Design System and Cross-Portal Consistency Audit

Assessment date: 2026-10-16  
Scope: read-only static audit of the Next.js web application across the platform-admin, licensing-expert, agency-owner/care-coordinator, caregiver, authentication, onboarding, and public-contact experiences. No application code, design configuration, environment variable, dependency, or `AGENTS.md` rule was changed.

## Audit method and limits

The assessment inventoried 327 TSX files, including 187 files under `src/components`, 20 shared UI files, and 87 route pages. It compared the global stylesheet and Tailwind configuration, shared layouts and controls, all native table/button/form usage, representative screens in every portal, test tooling, and repository guidance.

The findings marked **code-verified** are directly supported by the repository. Visual polish, computed contrast for tenant-selected colors, zoom behavior, screen-reader announcements, touch ergonomics, and real-device breakpoints require the browser validation listed under [Responsive and accessibility verification](#responsive-and-accessibility-verification). No claim in this report is based on a live production or PHI environment.

## A. Executive Summary

**Design-system maturity: 2.5 / 5 — emerging shared system with uneven adoption.**

MyCareSight has a useful foundation: one Tailwind stack, an Inter root font, runtime brand variables, shared portal navigation, and reusable controls for buttons, tabs, status badges, search, tables, and actions. The table pattern even has implementation documentation and Playwright helpers. These are valuable assets and make incremental standardization practical.

The application does not yet operate as a governed design system. Most visual decisions still live in component class strings. A static scan found native buttons in 130 files, native inputs in 100, native selects in 67, native tables in 34, and inline style objects in 36 files. Only three brand colors are exposed through Tailwind, while 246 distinct direct palette utilities are used across the source. Shared components exist, but page headers, cards, status indicators, tables, modal shells, validation, empty states, and loading treatments remain partly duplicated.

The main weaknesses are:

1. **The base type scale is smaller than its class names imply.** `html` is set to 14px and `body` to `0.875rem`, so Tailwind's rem-based `text-sm` resolves to about 12.25px and `text-xs` to about 10.5px. These are the two most frequently used text utilities. This is a broad readability and accessibility concern, especially for caregiver workflows.
2. **Branding is only partly semantic.** Runtime primary/sidebar variables are sound, but hundreds of direct gray, blue, red, green, and amber utilities bypass the brand layer. Tenant colors cannot consistently affect focus rings, links, selected controls, charts, or legacy primary buttons.
3. **Core interaction accessibility has structural gaps.** The shared modal handles Escape and scroll locking but lacks dialog semantics, focus containment, initial focus, and focus return. Sortable headers attach click behavior to `<th>` elements without keyboard interaction or `aria-sort`.
4. **Shared patterns are not consistently adopted.** `PrimaryButton` is imported in 90 files, while native buttons remain in 130; `useTableState` is used by 7 of 34 native-table files; `PageHeader` is used in only 7 application files while 49 files render local `<h1>` elements; and local status helpers remain alongside `StatusBadge`.
5. **Large screen components increase drift and regression risk.** Several domain components combine loading, mutation, modal, form, table, and presentation concerns in files ranging from roughly 1,000 to more than 7,600 lines.

The highest-value opportunity is to standardize the foundation and strengthen the primitives already present, then migrate high-traffic screens without redesigning business workflows. No framework migration is needed. Tailwind, the current CSS-variable branding boundary, React Hook Form/Zod, and the existing shared components are sufficient.

## B. Design System Inventory

| Area | Existing implementation | Coverage and maturity | Evidence |
|---|---|---|---|
| Styling strategy | Tailwind CSS 3 with one global stylesheet; component-local utility strings; occasional inline style objects; no active MUI imports found | One primary styling approach is good. Component-local decisions dominate and no class-composition/variant utility is present. | [`tailwind.config.ts`](../../tailwind.config.ts#L3), [`globals.css`](../../src/app/globals.css#L1), [`package.json`](../../package.json#L49) |
| Color tokens | `--brand`, `--brand-hover`, `--brand-subtle`, `--sidebar-bg`, and `--content-bg`; only the first three are registered as Tailwind colors | Partial semantic layer. Runtime branding exists, but neutral, text, surface, border, focus, danger, success, warning, and info roles are not tokenized. | [`globals.css`](../../src/app/globals.css#L5), [`tailwind.config.ts`](../../tailwind.config.ts#L17) |
| Tenant branding | Platform/agency layouts inject brand and sidebar CSS variables; a shared builder exists | Strong architectural direction. Agency/caregiver layouts duplicate the builder logic, and direct palette classes limit theme reach. | [`color-utils.ts`](../../src/lib/color-utils.ts#L29), [`admin/layout.tsx`](../../src/app/pages/admin/layout.tsx#L13), [`agency/layout.tsx`](../../src/app/pages/agency/layout.tsx#L23) |
| Typography | Inter loaded through `next/font`; Tailwind font-size utilities; global 14px root | Font family is centralized. Scale, weights, line heights, and roles are not defined as semantic tokens or components. | [`app/layout.tsx`](../../src/app/layout.tsx#L2), [`globals.css`](../../src/app/globals.css#L14) |
| Spacing and sizing | Tailwind default scale plus arbitrary fixed values such as a 90px header, 16/64 sidebar widths, and modal max heights | Consistent framework scale, but shell dimensions and repeated control dimensions are not named tokens. | [`AppHeader.tsx`](../../src/components/ui/AppHeader.tsx#L37), [`AppSidebar.tsx`](../../src/components/ui/AppSidebar.tsx#L182), [`Modal.tsx`](../../src/components/Modal.tsx#L67) |
| Radius and elevation | Mostly `rounded-lg`/`rounded-xl`; many `shadow`, `shadow-md`, and `shadow-sm` combinations | Visual family is recognizable, but elevation meaning is not standardized. Static scan found 1,063 `rounded-lg`, 597 `rounded-xl`, 375 `shadow`, 185 `shadow-md`, and 107 `shadow-sm` uses. | [`SectionCard.tsx`](../../src/components/ui/SectionCard.tsx#L21), [`StatCard.tsx`](../../src/components/ui/StatCard.tsx#L28) |
| Breakpoints | Tailwind defaults; no custom screen definitions | Sensible default. Responsive behavior is implemented ad hoc at component level, with heavy `sm`, `md`, and `lg` use and very little large-screen policy. | [`tailwind.config.ts`](../../tailwind.config.ts#L5), [`DashboardLayout.tsx`](../../src/components/DashboardLayout.tsx#L170) |
| Buttons | Shared `PrimaryButton` supports primary, secondary, danger, ghost, sizes, icons, loading, and focus styles | Good API despite its misleading name. Adoption is partial, and direct button styles include brand, blue, black, gray gradients, and portal-specific dimensions. | [`PrimaryButton.tsx`](../../src/components/ui/PrimaryButton.tsx#L5), [`StaffManagementClient.tsx`](../../src/components/StaffManagementClient.tsx#L280), [`login/page.tsx`](../../src/app/pages/auth/login/page.tsx#L317) |
| Tables | Written table standard; `useTableState`, sortable header, pagination, record actions, search, and filters | Strongest documented subsystem. Only 7 native-table files use `useTableState`, 10 import pagination, and 7 import sortable headers; report/detail tables may intentionally be static. | [`TABLES.md`](../../src/components/ui/TABLES.md#L1), [`useTableState.ts`](../../src/hooks/useTableState.ts#L15), [`TablePagination.tsx`](../../src/components/ui/TablePagination.tsx#L13) |
| Forms | React Hook Form, Zod resolver, shared validation, `EmailInput`, `PhoneInput`, and inline error conventions | Partial migration. Static scan found 57 form files, 39 RHF files, 39 resolver files, and 26 `noValidate` files. Repeated label/input/error classes remain widespread. | [`EmailInput.tsx`](../../src/components/ui/EmailInput.tsx#L5), [`PhoneInput.tsx`](../../src/components/ui/PhoneInput.tsx#L6), [`AddAgencyModal.tsx`](../../src/components/AddAgencyModal.tsx#L182) |
| Modal/dialog | Shared `Modal` with size variants, backdrop behavior, Escape support, sticky header, and body-scroll locking | Widely reused but incomplete as an accessible dialog. At least 15 files also implement manual full-screen overlays. | [`Modal.tsx`](../../src/components/Modal.tsx#L6), [`AddUserModal.tsx`](../../src/components/AddUserModal.tsx#L80), [`PlanManagementContent.tsx`](../../src/components/PlanManagementContent.tsx#L108) |
| Navigation/layout | `AppHeader` and `AppSidebar` reused by Admin, Agency, Expert, and Staff layouts; agency grouping and locked capability states | Strong cross-portal reuse. Layout wrappers still duplicate shell state and spacing, and caregiver omits the header page-title behavior used in other portals. | [`AppHeader.tsx`](../../src/components/ui/AppHeader.tsx#L25), [`AppSidebar.tsx`](../../src/components/ui/AppSidebar.tsx#L46), [`StaffLayout.tsx`](../../src/components/StaffLayout.tsx#L64) |
| Status/labels | Shared generic `Badge` and semantic `StatusBadge`; separate visit-status helper | Correct separation in principle. Numerous local status functions duplicate palettes and label rules. Domain-specific visit state is a valid separate map. | [`Badge.tsx`](../../src/components/ui/Badge.tsx#L1), [`StatusBadge.tsx`](../../src/components/ui/StatusBadge.tsx#L9), [`visit-status-styles.ts`](../../src/lib/visit-status-styles.ts) |
| Feedback | Root Sonner toaster, button loading state, `LoadingSpinner`, route loading files, and local empty/error states | Infrastructure exists; presentation and announcement semantics differ by screen. | [`sonner.tsx`](../../src/components/ui/sonner.tsx#L6), [`LoadingSpinner.tsx`](../../src/components/LoadingSpinner.tsx#L5), [`CaregiverVisitExecutionContent.tsx`](../../src/components/CaregiverVisitExecutionContent.tsx#L242) |
| Icons | Predominantly Lucide icons with component-specific sizes and stroke widths | Central library is consistent; sizing and accessible labeling are mostly local. | [`PrimaryButton.tsx`](../../src/components/ui/PrimaryButton.tsx#L2), [`AppSidebar.tsx`](../../src/components/ui/AppSidebar.tsx#L6) |
| Automated UI coverage | Jest/Testing Library, Playwright desktop Chromium, shared table assertions, sidebar accessibility behavior tests | Useful behavior coverage. No axe integration, visual snapshots, Storybook, or mobile Playwright project was found. | [`playwright.config.ts`](../../playwright.config.ts#L15), [`table-assertions.ts`](../../e2e/helpers/table-assertions.ts#L1), [`app-sidebar-accordion.test.tsx`](../../src/_tests_/app-sidebar-accordion.test.tsx#L29) |

The repository includes MUI and MUI date-picker dependencies, but no source imports were found. The current UI system is Tailwind-based; introducing MUI for new standard controls would create a second system without solving the adoption problem.

## C. Inconsistency Matrix

| Category | Description | Affected areas | Evidence | Existing implementation | Recommended standard | Severity | Effort |
|---|---|---|---|---|---|---|---|
| Typography | Global 14px root shrinks all rem-based Tailwind sizes; `text-sm` and `text-xs` become approximately 12.25px and 10.5px | All portals, especially tables, forms, caregiver execution | [`globals.css:14`](../../src/app/globals.css#L14) | Root 14px; body `0.875rem`; heavy use of `text-sm`/`text-xs` | Restore a 16px root, define body/label/caption roles, and adjust dense controls deliberately | **High** | M; broad visual regression review |
| Color/theming | Semantic brand variables coexist with direct palette values; fixed blue focus and action styles bypass tenant branding | All portals | [`tailwind.config.ts:17`](../../tailwind.config.ts#L17), [`RecordActionsMenu.tsx:99`](../../src/components/ui/RecordActionsMenu.tsx#L99), [`LoadingSpinner.tsx:25`](../../src/components/LoadingSpinner.tsx#L25) | 3 Tailwind brand aliases; 246 distinct direct palette utilities | Add semantic surface/text/border/action/focus/feedback tokens and migrate by role | **High** | L, incremental |
| Branding implementation | Admin/expert use `buildBrandingStyleVars`; agency/caregiver reproduce its logic | Portal layouts | [`admin/layout.tsx:13`](../../src/app/pages/admin/layout.tsx#L13), [`agency/layout.tsx:23`](../../src/app/pages/agency/layout.tsx#L23) | Shared helper plus duplicated CSS-var assembly | Use one validated theme-variable builder in every portal | Medium | S |
| Buttons | Shared component is broadly used, but local buttons duplicate primary, secondary, icon, and loading styles | 130 files with native buttons; auth, dashboards, reports, CRUD screens | [`PrimaryButton.tsx:17`](../../src/components/ui/PrimaryButton.tsx#L17), [`caregiver/page.tsx:262`](../../src/app/pages/caregiver/page.tsx#L262), [`StaffManagementClient.tsx:280`](../../src/components/StaffManagementClient.tsx#L280) | `PrimaryButton` in 90 files plus raw variants | Evolve it into the canonical `Button`; add link/button and icon-button conventions; permit native buttons only inside primitives or special controls | High | M |
| Tables | Documented table structure is not a reusable shell and is only partly adopted | 34 native-table files across all portals | [`TABLES.md:95`](../../src/components/ui/TABLES.md#L95), [`useTableState.ts:15`](../../src/hooks/useTableState.ts#L15) | Repeated table markup; shared state/helpers in selected management tables | Create composable table shell/toolbar/empty-state components with standard and compact density; keep domain columns local | High | M–L |
| Table accessibility | Sort is attached to the `<th>` itself; it is not keyboard-operable and does not expose `aria-sort` | All tables using shared sortable header | [`SortableColumnHeader.tsx:24`](../../src/components/ui/SortableColumnHeader.tsx#L24), [`table-assertions.ts:99`](../../e2e/helpers/table-assertions.ts#L99) | Pointer-clickable column header; Playwright only clicks it | Put a real button inside `<th>`, expose `aria-sort`, preserve focus, and test keyboard toggling | **High** | S |
| Modals | Shared modal lacks `role="dialog"`, `aria-modal`, title association, focus trap, initial focus, and return focus; manual overlays add divergence | Most CRUD flows; at least 15 manual overlays | [`Modal.tsx:76`](../../src/components/Modal.tsx#L76), [`ApplicationNotesModal.tsx:30`](../../src/components/ApplicationNotesModal.tsx#L30) | Escape/backdrop/scroll lock implemented; semantics vary | Harden the shared dialog first, then move manual overlays to it; define confirmation and stacked-dialog variants | **High** | M |
| Forms | RHF/Zod conventions coexist with local state, manual validation, repeated input classes, and inconsistent `noValidate` use | Auth, onboarding, scheduling, legacy detail forms | [`AddAgencyModal.tsx:182`](../../src/components/AddAgencyModal.tsx#L182), [`AgencyOnboardingForm.tsx:231`](../../src/components/AgencyOnboardingForm.tsx#L231), [`login/page.tsx:236`](../../src/app/pages/auth/login/page.tsx#L236) | 39 RHF/Zod files among 57 form files | Add `FormField`, `Label`, `Input`, `Select`, `Textarea`, `FieldError`, and required-marker primitives; migrate when each form changes | High | L |
| Form accessibility | Shared email/phone errors are rendered without automatic IDs, `aria-invalid`, or `aria-describedby` wiring | User-facing email/phone forms | [`EmailInput.tsx:16`](../../src/components/ui/EmailInput.tsx#L16), [`PhoneInput.tsx:18`](../../src/components/ui/PhoneInput.tsx#L18) | Inline visible error paragraph | Let a field wrapper generate IDs and connect labels, help, and errors; use `aria-live` only for submission summaries | High | S–M |
| Headings/page chrome | AppHeader can render an H1, while content screens frequently render another local H1; caregiver layout does not pass a page title | Admin/agency/expert/caregiver | [`AppHeader.tsx:54`](../../src/components/ui/AppHeader.tsx#L54), [`PlanManagementContent.tsx:202`](../../src/components/PlanManagementContent.tsx#L202), [`StaffLayout.tsx:67`](../../src/components/StaffLayout.tsx#L67) | Header title plus local headings with varied sizes; 7 `PageHeader` adopters | Choose one H1 owner per route; use `PageHeader` for content title/actions or expose a shell title slot, not both | Medium | M |
| Cards/stats | `SectionCard` and `StatCard` exist but have almost no adoption; repeated card strings vary between `shadow-sm` and `shadow-md` | Dashboards, reports, detail pages | [`SectionCard.tsx:21`](../../src/components/ui/SectionCard.tsx#L21), [`StatCard.tsx:28`](../../src/components/ui/StatCard.tsx#L28), [`agency/page.tsx:119`](../../src/app/pages/agency/page.tsx#L119) | Local card markup on most screens | Establish surface/elevation variants and migrate repeated dashboard/report card structures | Medium | M |
| Status presentation | Shared `StatusBadge` coexists with at least 14 local status helper files | Expert, caregiver, licenses, people, reports | [`StatusBadge.tsx:74`](../../src/components/ui/StatusBadge.tsx#L74), [`ExpertApplicationsContent.tsx:62`](../../src/components/ExpertApplicationsContent.tsx#L62), [`AgencyPeopleTab.tsx:766`](../../src/components/AgencyPeopleTab.tsx#L766) | Same semantic statuses can receive different colors, padding, and wording | Centralize general lifecycle statuses; retain a documented domain mapper for visit/clinical states | Medium | M |
| Feedback states | Loading, error, and empty states range from plain text to spinners, cards, overlays, and toasts; announcement behavior varies | All portals | [`LoadingSpinner.tsx:23`](../../src/components/LoadingSpinner.tsx#L23), [`AgencyDocumentsTab.tsx:181`](../../src/components/AgencyDocumentsTab.tsx#L181), [`sonner.tsx:6`](../../src/components/ui/sonner.tsx#L6) | Root toast and spinner plus local render branches | Add `InlineLoading`, `PageLoading`, `EmptyState`, `ErrorState`, and `FormErrorSummary` with consistent semantics | Medium | M |
| Responsive tables | Horizontal scrolling is common, but column hiding, compact/mobile row rendering, and sticky actions are screen-specific | Data-heavy agency/admin screens | [`TABLES.md:95`](../../src/components/ui/TABLES.md#L95), [`UserManagementTabs.tsx:445`](../../src/components/UserManagementTabs.tsx#L445) | `overflow-x-auto` plus scattered responsive cells | Define per-table priority columns and a mobile policy: scroll for comparison tables, card/list rendering for task workflows | Medium | M–L; browser validation required |
| Component architecture | Very large client components own multiple UI and workflow concerns | Client detail, application detail, license details, programs, caregiver visits | [`ClientDetailContent.tsx`](../../src/components/ClientDetailContent.tsx#L262), [`ApplicationDetailContent.tsx`](../../src/components/ApplicationDetailContent.tsx#L148), [`LicenseTypeDetails.tsx`](../../src/components/LicenseTypeDetails.tsx#L84) | Files from ~1,000 to >7,600 lines; local helpers and modal branches | Extract presentational sections around stable domain boundaries; keep orchestration/data state in feature containers | High | L, staged with regression tests |
| Auth/public styling | Authentication and contact pages use separate gradients, inline styles, an external background image, and direct colors | Login/reset/contact | [`login/page.tsx:142`](../../src/app/pages/auth/login/page.tsx#L142), [`contact/page.tsx:105`](../../src/app/contact/page.tsx#L105) | Visually distinct acquisition/auth treatment | Keep an intentional auth/public theme, but feed it semantic tokens and shared field/button/accessibility primitives | Medium | M |
| Dependencies/governance | MUI packages are installed but unused; ESLint has no design-system restrictions | Repository-wide | [`package.json:51`](../../package.json#L51), [`eslint.config.mjs`](../../eslint.config.mjs#L7) | Tailwind is de facto system; no automated primitive enforcement | Avoid MUI adoption, confirm/remove unused packages separately, and add scoped lint/check rules after migration | Low | S |

## D. Component Reuse Analysis

### Reuse that is working

- **Portal chrome:** `AppHeader` and `AppSidebar` provide one visual and behavioral base for four role portals. The sidebar already covers active state, capability locks, grouped navigation, collapsed mode, mobile overlay, badges, and logout. Its grouped behavior has focused accessibility-aware tests.
- **Button API:** `PrimaryButton` already includes the variants needed for normal application work. It should be evolved and renamed rather than replaced.
- **Table building blocks:** `useTableState`, `SearchInput`, `SortableColumnHeader`, `TablePagination`, and `RecordActionsMenu` are a coherent set. The table documentation and E2E helpers provide a useful governance seed.
- **Status semantics:** `Badge` versus `StatusBadge` correctly distinguishes categorical labels from lifecycle states.
- **Validation foundations:** React Hook Form, Zod, shared schemas, phone/email validation, and server field-error mapping are established in newer forms.
- **Feedback and icons:** One root Sonner toaster and Lucide icon library prevent provider-level fragmentation.

### Duplication to consolidate

- Local primary/secondary/icon buttons should call the shared button primitive unless they implement a specialized interaction such as a tab, menu item, calendar cell, or editor control.
- Manual modal overlays should be replaced after the shared modal meets dialog accessibility requirements. Migrating first would spread current accessibility defects.
- General lifecycle badge helpers in expert, license, user, caregiver-certification, and report screens should map to `StatusBadge`. Visit statuses can retain a domain-specific palette because they carry operational meaning beyond generic active/pending/error.
- Repeated card shells should converge on `SectionCard`/`StatCard` variants. Their APIs should be tested against real dashboard and report needs before mass migration.
- Repeated table markup should use composable structural primitives. A single generic data-grid abstraction would be too rigid for the current mix of reports, editable rate grids, task matrices, and management lists.
- Form controls need shared visual wrappers. `EmailInput` and `PhoneInput` should remain behavioral inputs nested inside the same field primitive used by text, select, date, currency, and textarea controls.

### Intentional variants to preserve

- Authentication/public pages may use a distinct presentation, but their controls, tokens, focus behavior, validation, and responsive rules should still come from the system.
- Caregiver visit execution should favor large touch targets and task completion clarity over dense admin presentation.
- Reports and editable time/rate matrices may use compact tables; task-oriented mobile screens may switch to stacked cards. These should be named density/layout variants rather than one-off class strings.
- TipTap editor content, FullCalendar, charts, and color visualization require targeted adapter styles. They should consume tokens where possible without being forced into standard form/table primitives.

### Architectural maintainability

The most significant maintenance risk is screen size and responsibility. `ClientDetailContent.tsx` is over 7,600 lines, and several other feature components exceed 1,000 lines. These files naturally accumulate private versions of fields, tabs, cards, badges, and dialogs. Extraction should follow stable business sections—client identity, care plan, visits, documents, incidents, billing—and should preserve the current action/repository boundaries. A broad rewrite would create unnecessary workflow and PHI-access risk.

## E. Centralization Assessment

| UI category | Rating | Rationale |
|---|---|---|
| Framework/styling | **Centralized** | Tailwind and one global CSS file are the active styling system. MUI is installed but not used in source. |
| Brand colors | **Partially centralized** | Runtime CSS variables exist, but most foreground, focus, feedback, and selected-state colors remain direct utilities. |
| Typography | **Decentralized** | Font family and root size are global; semantic type roles, line heights, and heading ownership live in screens. |
| Spacing/sizing | **Decentralized** | Tailwind scale provides consistency, but component dimensions and page rhythm are selected locally. |
| Radius/elevation | **Decentralized** | A recognizable style exists through repetition, without semantic surface/elevation variants. |
| Breakpoints | **Partially centralized** | Tailwind default breakpoints are central; responsive behavior and table policy are local. |
| Portal shell/navigation | **Centralized** | Shared header/sidebar serve all authenticated portals, with thin role layouts. |
| Buttons | **Partially centralized** | A capable shared component has broad but incomplete adoption. |
| Forms | **Partially centralized** | Shared behavioral inputs and validation rules exist; visual field structure and migration status vary. |
| Tables | **Partially centralized** | Documentation, state, sorting, pagination, and actions exist; structure and adoption vary. |
| Modals | **Partially centralized** | A shared shell is common, but manual dialogs remain and the shared shell lacks accessibility behaviors. |
| Status and badges | **Partially centralized** | Two good shared primitives coexist with multiple local implementations. |
| Loading/empty/error feedback | **Decentralized** | Toaster and spinner are shared; local state views are not. |
| Icons | **Centralized** | Lucide is the consistent icon source. |
| Themes/white-label support | **Partially centralized** | Runtime agency/platform colors are supported, but direct palette use and missing contrast validation limit safe extension. |
| UI documentation/testing | **Partially centralized** | Tables have documentation and E2E helpers; the wider system has no catalog, visual regression, or automated a11y checks. |

## Responsive and accessibility verification

### Code-verified strengths

- Portal navigation exposes `aria-current`, labels collapsed items, marks expansion state, and hides collapsed regions from assistive technology ([`AppSidebar.tsx`](../../src/components/ui/AppSidebar.tsx#L136)).
- Shared buttons and tabs include visible focus-ring classes ([`PrimaryButton.tsx`](../../src/components/ui/PrimaryButton.tsx#L52), [`Tabs.tsx`](../../src/components/ui/Tabs.tsx#L24)).
- Numerous icon-only controls have accessible names, and key long-running caregiver operations use `aria-live` ([`CaregiverVisitExecutionContent.tsx`](../../src/components/CaregiverVisitExecutionContent.tsx#L242)).
- Portal content padding and sidebar offsets respond at Tailwind breakpoints, and most tables provide horizontal overflow containment.

### Code-verified gaps

- Shared modal dialog semantics and focus lifecycle are incomplete.
- Shared sortable table headers are pointer-only and omit `aria-sort`.
- Tabs expose `tab`/`tablist` roles but do not establish `aria-controls`, panel IDs, arrow-key navigation, or roving tab index.
- Visible field errors are not consistently programmatically associated with inputs.
- Loading overlays do not consistently expose `role="status"`, `aria-live`, or a nonvisual label.
- The global root type scale produces unusually small computed sizes.
- Runtime brand colors are not checked for contrast against white, dark sidebar content, focus indicators, or subtle backgrounds.

### Browser testing required before declaring conformance

1. Keyboard-only traversal for header, sidebar groups, tables, menus, tabs, dialogs, date pickers, FullCalendar, editors, and every multi-step modal.
2. Focus entry, containment, Escape behavior, stacked-dialog behavior, and focus return for every dialog family.
3. NVDA/Chrome and VoiceOver/Safari checks for page titles, table sorting, validation errors, toast announcements, loading states, and dynamic task updates.
4. Automated axe scans on representative routes for every role, followed by manual review because axe will not detect workflow or reading-order defects.
5. 200% and 400% zoom, Windows text scaling, and viewport checks at approximately 320, 375, 768, 1024, and 1440 CSS pixels.
6. Real iOS/Android touch checks for caregiver screens, including 44px targets, sticky controls, virtual keyboard overlap, landscape, and safe-area behavior.
7. Contrast checks for default and tenant-selected brand/sidebar colors in normal, hover, selected, disabled, focus, and feedback states.
8. Reduced-motion verification for loading overlays, pulsing auth decoration, navigation transitions, and hover transforms.

## F. Target Architecture

Keep the existing stack. The target is a thin, application-owned design-system layer built with Tailwind and CSS variables, without a MUI migration or a generic component framework.

### 1. Foundation

- Expand `globals.css` into semantic variables for canvas, surface, elevated surface, text, muted text, border, focus, primary action, destructive, success, warning, info, and their foreground/subtle states.
- Register those variables in Tailwind under semantic names. Keep raw palette utilities available for charts and exceptional domain visualizations, but disallow them in standard controls after migration.
- Restore normal root sizing and define documented typography roles: page title, section title, body, label, helper, caption, and numeric metric.
- Define named radii, elevations, control heights, shell dimensions, content widths, and density choices. Use Tailwind defaults where they already fit.
- Generate and validate theme variables through one helper. Treat tenant branding as input to a constrained semantic palette, with contrast fallback rather than applying arbitrary colors blindly.

### 2. Primitives in `src/components/ui`

- `Button` evolved from `PrimaryButton`, plus an explicit `IconButton` when a visible label is absent.
- Accessible `Dialog` evolved from `Modal`, with title/description IDs, focus management, portal behavior, confirmation variant, and stacked-dialog policy.
- `FormField`, `Label`, `Input`, `Select`, `Textarea`, `FieldHelp`, and `FieldError`; behavioral inputs such as phone/email compose these.
- `PageHeader`, `SectionCard`, `StatCard`, `Tabs`, `Badge`, and `StatusBadge` retained and hardened.
- `InlineLoading`, `PageLoading`, `EmptyState`, `ErrorState`, and `FormErrorSummary` for predictable feedback.
- Composable `TableShell`, `TableToolbar`, `TableEmptyState`, sortable button header, pagination, and density variants. Business columns and query behavior remain feature-owned.

### 3. Feature composition

- Group complex UI by domain under feature-oriented folders while preserving server/client boundaries and existing routes.
- Keep business authorization, data access, mutation rules, and audit behavior outside presentation primitives.
- Page and feature components choose data, permissions, columns, status mapping, and workflow. UI primitives own appearance, keyboard behavior, and ARIA mechanics.
- Maintain special adapters for FullCalendar, TipTap, charts, and domain-specific visit states.

### 4. Governance

- Add a lightweight in-repository component catalog or development-only showcase route after primitives stabilize. It should use synthetic, non-PHI fixtures only.
- Add focused unit accessibility tests for primitives, axe scans for representative routes, mobile and desktop Playwright projects, and visual snapshots for the catalog/critical shells.
- Add scoped lint or repository checks only after migrations reduce false positives: forbid new manual modal overlays, direct standard-button styles, and local general-status maps outside allowlisted primitives/adapters.
- Record intentional variants next to the primitive documentation so enforcement does not erase valid caregiver, report, editor, or public-site differences.

## G. Incremental Roadmap

| Phase | Scope | Deliverables | Effort | Risks/dependencies |
|---|---|---|---|---|
| **1. Tokens and foundations** | Fix the base scale; define semantic colors, type roles, radius/elevation, focus, control heights, and density; unify theme generation | Token map, contrast rules, before/after inventory, browser matrix, migration compatibility aliases | **M: 5–8 engineering days plus visual QA** | Root font change affects every screen. Capture baselines first and review dense tables/caregiver touch flows. |
| **2. Shared components** | Harden button, dialog, fields, tabs, sortable header, cards, and feedback states; add primitive tests/catalog | Accessible primitives, documented variants, unit/axe coverage, compatibility wrappers | **M–L: 8–15 engineering days** | Modal focus behavior and field error wiring can expose latent workflow issues; preserve APIs during migration. |
| **3. Screen migration** | Migrate by workflow: auth/public, admin lists, agency lists, expert workflows, caregiver screens, then large detail components | Consistent high-traffic screens, removal of local status/modal/button duplicates, feature-level regression tests | **L: multiple slices over 4–8 weeks** | Avoid a big-bang rewrite. Coordinate with active Neon/auth/mobile work and preserve PHI/access behavior. |
| **4. Automated enforcement** | Add lint/repository rules, representative visual regression, desktop/mobile Playwright, axe gates, and ownership docs | CI checks, exception mechanism, design-system changelog and review checklist | **M: 5–10 engineering days** | Enable rules only after existing debt is migrated or explicitly allowlisted. Visual snapshots need deterministic synthetic data. |

### Recommended first implementation slice

After approval, start with a narrow Phase 1/2 slice:

1. Capture synthetic screenshots for one representative page per portal at desktop and mobile widths.
2. Introduce semantic token aliases without changing current rendered values.
3. Harden `Modal` and `SortableColumnHeader` accessibility with focused tests.
4. Restore a 16px root in an isolated branch, adjust the shared primitives, and review every representative screen before adopting it globally.
5. Migrate one management table and one form/modal as reference implementations, then update `TABLES.md` and the new UI guidance from what was proven.

This sequence addresses accessibility and future theming while keeping the blast radius reviewable.

## H. Draft `AGENTS.md` UI Rules

The following text is proposed only. This audit did **not** modify `AGENTS.md`.

```md
## UI Design System

- Search `src/components/ui/` and existing feature components before creating a visual or interaction pattern. Extend the established primitive when the behavior is the same.
- Use semantic design tokens for application surfaces, text, borders, actions, focus, and feedback. Do not add fixed blue/gray/hex colors to a standard control when a semantic token exists.
- Use the shared `Button` variants for primary, secondary, danger, ghost, loading, and icon actions. Native `<button>` styling is reserved for primitives and specialized widgets such as tabs, menus, calendars, and editors.
- Use the shared dialog component for modal interactions. New manual `fixed inset-0` dialog shells are not allowed. Dialogs must have an accessible name, focus containment, Escape behavior, and focus return.
- Use shared form fields with React Hook Form and shared Zod schemas. Labels, required markers, help text, `aria-invalid`, `aria-describedby`, and inline field errors must be connected programmatically.
- Use `PhoneInput` and `EmailInput` inside the shared field wrapper. Do not introduce raw user-facing telephone or email fields.
- Use `PageHeader`, `SectionCard`, `StatCard`, `Tabs`, `Badge`, and `StatusBadge` for their documented roles. A route must have exactly one meaningful H1.
- Follow `src/components/ui/TABLES.md`. Sort controls must be keyboard operable and expose `aria-sort`. Choose the documented standard or compact density and define the mobile column/row policy.
- Use shared loading, empty, error, and toast patterns. Keep field errors inline; use toasts for non-field failures and confirmations. Dynamic status messages must have appropriate live-region behavior.
- Preserve intentional workflow variants. Caregiver execution may use larger touch controls; reports may use compact tables; TipTap, FullCalendar, charts, and domain visit states may use documented adapters.
- Do not put authorization, tenant scope, database access, storage access, audit behavior, or business rules in design-system components.
- Test changed primitives with keyboard and accessibility assertions. For material visual changes, update synthetic desktop/mobile visual coverage for each affected portal.
- New theme values must work with platform and agency branding and meet contrast requirements in default, hover, selected, disabled, and focus states.
```

## Highest-impact findings

1. Correct the global type scale with controlled visual regression review.
2. Turn the current brand variables into a complete semantic token layer so white-labeling affects the whole experience safely.
3. Fix shared modal and sortable-header accessibility before migrating more screens onto them.
4. Use the existing button, table, form, badge, and shell foundations consistently instead of adding another library or new parallel primitives.
5. Break the largest feature components into stable presentational sections during normal workflow changes rather than through a broad rewrite.

Implementation should begin only after the Phase 1 direction and the root typography change are explicitly approved.
