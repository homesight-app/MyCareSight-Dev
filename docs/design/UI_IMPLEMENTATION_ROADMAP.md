# MyCareSight UI Design System Implementation Roadmap

Status: Step 1 governance roadmap

Last reviewed: 2026-10-16

Related documents: [UI design system](UI_DESIGN_SYSTEM.md), [UI baseline](UI_BASELINE.md), and [UI audit](../audits/ui-design-system-audit.md)

## Governing principle

**Application stability and functional preservation take priority over architectural perfection.**

The initiative should obtain the highest practical value from centralized design management while minimizing regression risk. A perfect maturity score, complete removal of duplicated styles, or full migration of every screen is not a success requirement.

No phase starts automatically. Every phase requires explicit approval after the previous phase reports its evidence and recommendation.

## Risk-versus-benefit decision framework

At the end of every phase, evaluate the following.

### Benefits achieved

- Improvement in centralized styling and component reuse.
- Reduction in visible inconsistency across portals.
- Improvement in maintainability and reviewability.
- Accessibility improvement where that behavior was in scope.
- Evidence that behavior and critical workflows remain intact.

### Remaining opportunities

- Which inconsistencies remain, and how visible are they?
- Do they affect frequent or safety-critical workflows?
- Are they cosmetic, structural, or accessibility-related?
- Can they be corrected more safely during ordinary feature maintenance?

### Risk and cost

- Number and complexity of affected components, screens, portals, and consumers.
- Potential for business, auth, tenant, PHI, validation, navigation, filtering, sorting, pagination, persistence, upload, or workflow regression.
- Available unit, integration, Playwright, accessibility, and visual evidence.
- Ease of independent rollback.
- Engineering and review effort relative to user and maintenance benefit.

### Decision outcomes

| Decision | Use when |
|---|---|
| **PROCEED** | The next scope is controlled, benefits clearly justify the risk, regression coverage is adequate, and rollback is practical. |
| **PROCEED SELECTIVELY** | Only named high-value improvements justify their risk. Broad migration should be deferred and lower-value work handled opportunistically. |
| **STOP** | Remaining differences are mostly cosmetic, working workflows would face disproportionate risk, evidence is inadequate, or effort exceeds expected value. |

When evidence is insufficient, reduce scope or gather the missing evidence. Do not classify uncertainty as low risk.

## Mandatory phase approval gate

At every phase boundary:

1. Summarize what was accomplished.
2. Identify remaining inconsistencies and deferred decisions.
3. Report validation evidence, outstanding risks, and tests not run.
4. Estimate the practical benefit and effort of the next phase.
5. Recommend `PROCEED`, `PROCEED SELECTIVELY`, or `STOP`.
6. Request and receive explicit approval before starting the next phase.

Approval for one phase does not authorize later phases, deployment, or merge.

## Phase 1 — Governance and baseline

Status: **Current authorized phase**

### Scope and deliverables

- Permanent design-system and cross-portal rules in `AGENTS.md`.
- Current and target architecture in `UI_DESIGN_SYSTEM.md`.
- Representative screen inventory and safe screenshot plan in `UI_BASELINE.md`.
- This phased roadmap and decision framework.
- No runtime, style, configuration, data, dependency, deployment, or environment changes.

### Expected benefits

- A shared vocabulary for current, proposed, exceptional, and deferred patterns.
- Clear ownership boundaries that protect business and authorization logic.
- A repeatable baseline and validation plan before visual changes.
- Explicit limits on broad rewrites and automatic phase progression.

### Major risks

- Documentation can drift from implementation if it is not reviewed with future changes.
- Static inspection cannot establish computed contrast, responsive behavior, keyboard behavior, or screen-reader output.
- Existing dirty work can complicate commit boundaries; only approved files should be staged in any later commit.

### Dependencies

- The completed code audit.
- Repository guidance and existing component/table documentation.
- Future access to a safe synthetic environment for live baselines.

### Effort estimate

Small: approximately 1–2 engineering days including review. This is an estimate, not a guarantee.

### Validation requirements

- Verify required headings and topics exist.
- Validate internal repository links.
- Run Markdown/diff whitespace checks available without adding dependencies.
- Confirm the Step 1 change set contains only documentation and `AGENTS.md` guidance.
- Review the final diff for preservation of existing project rules.

Application lint, typecheck, build, unit, integration, and Playwright runs are not required for documentation-only changes unless repository tooling reveals generated or executable documentation behavior. Report them as not run.

### Rollback

Revert the three new documentation files and the single consolidated `AGENTS.md` section. Do not revert unrelated pre-existing worktree changes.

### Explicit approval checkpoint

Stop after the Step 1 completion report. Apply the decision framework and obtain explicit approval before any Phase 2 change.

## Phase 2 — Centralized design foundations

Status: **Future; requires explicit approval**

### Potential scope

- Add semantic aliases for existing colors, surfaces, text, borders, focus, feedback, spacing, control dimensions, radii, elevation, and density.
- Consolidate theme-variable generation behind the existing application-owned helper.
- Document typography roles while initially retaining current computed values.
- Create compatibility aliases so existing classes and consumers can migrate incrementally.

This phase should initially preserve rendered values. A global root-font change or broad styling adjustment is a separate decision with its own approval and visual-regression plan.

### Expected benefits

- Central control over ordinary visual roles and safer future theme changes.
- Reduced introduction of new direct palette and dimension values.
- A stable vocabulary for shared-component work.

### Major risks

- Tokens used at the application root can affect every portal.
- CSS fallback or tenant-theme mistakes can reduce contrast or make controls unreadable.
- Renaming or replacing current variables can silently break existing branded layouts.

### Dependencies

- Approved current-value token map and naming convention.
- Verified default and tenant-brand contrast rules.
- Synthetic screenshots for representative portal screens, or an explicitly approved reduced evidence plan.
- Inventory of every existing CSS-variable consumer.

### Effort estimate

Medium: approximately 5–8 engineering days plus review and visual QA. This is an estimate, not a commitment.

### Validation requirements

- Consumer inventory and focused token/theme tests.
- Typecheck, lint, build, and applicable unit tests.
- Desktop/tablet/mobile comparisons for every portal using synthetic data.
- Keyboard, zoom, focus visibility, and contrast review for default and tenant themes.
- Confirmation that routes, data, auth, authorization, validation, and workflows did not change.

### Rollback

Introduce foundations in one compatibility-preserving commit or small independently reversible commits. Retain prior variables until all consumers are verified. Revert the token alias layer without touching feature code if evidence fails.

### Explicit approval checkpoint

Require explicit approval for the exact token-only batch. Require a second explicit approval before any global typography or visually different default value.

## Phase 3 — Shared component standardization

Status: **Future; requires explicit approval after Phase 2 evidence**

### Potential scope

- Evolve the canonical button foundation without breaking current consumers.
- Improve composable table controls and structure.
- Add shared form-field presentation around existing RHF/Zod behavior.
- Improve status badges and loading/empty/error presentation.
- Address modal and sortable-header accessibility in focused, separately reviewable batches.

### Expected benefits

- Consistent interaction and styling at the point of reuse.
- Fewer local button, field, table, status, and feedback implementations.
- Accessibility fixes benefit multiple screens after one verified change.

### Major risks

- Shared-component regressions have a wide blast radius.
- Focus management and keyboard changes can alter interaction behavior even when visuals are unchanged.
- Public prop changes can force unsafe bulk migration.
- Standardization can erase useful caregiver/report/domain variants if the component API is too rigid.

### Dependencies

- A consumer/dependency inventory for each component.
- Current prop, callback, behavior, and visual baselines.
- Focused regression tests before changing behavior.
- Phase 2 foundations only when they have proven stable; components should not wait on unrelated token work.

### Effort estimate

Medium to large: approximately 8–15 engineering days across separate batches. This is an estimate, not a guarantee.

### Validation requirements

- Compatibility tests for existing public APIs.
- Typecheck, lint, build, focused unit/integration tests, and affected Playwright workflows.
- Keyboard and screen-reader-oriented assertions for interaction primitives.
- Before/after synthetic screenshots for every affected portal.
- Separate evidence for visual-only changes and accessibility behavior changes where practical.

### Rollback

One primitive or tightly related component family per batch. Preserve compatibility wrappers until consumers are migrated and verified. Revert an individual batch without reverting previously proven foundations.

### Explicit approval checkpoint

Approve each high-blast-radius primitive separately. Public API changes, modal focus behavior, and table interaction changes require explicit review before implementation.

## Phase 4 — Selective screen migration

Status: **Optional future phase**

### Potential scope

- Migrate selected high-traffic or visibly inconsistent screens onto proven shared foundations.
- Prefer one management table and one form/modal as initial reference implementations.
- Migrate lower-priority screens only when naturally touched by feature maintenance.
- Leave specialized or high-risk workflows unchanged when the benefit is cosmetic.

### Expected benefits

- Visible cross-portal consistency where users experience it most.
- Reduced local styling debt and clearer future maintenance paths.
- Real-world proof that shared components fit actual domain needs.

### Major risks

- Large components can hide business, state, and authorization coupling.
- Critical licensing, client, scheduling, EVV, upload, payroll, and billing workflows can regress during presentation changes.
- Broad migration creates review fatigue and weakens rollback boundaries.

### Dependencies

- Stable Phase 2/3 foundations.
- A screen-specific consumer and workflow inventory.
- Adequate regression coverage and synthetic test data.
- Product/operations agreement on which visible inconsistencies matter.

### Effort estimate

Large and slice-dependent: multiple reviewable batches over roughly 4–8 weeks if broad migration remains justified. Opportunistic migration may spread safely over normal product work.

### Validation requirements

- All standard code checks plus workflow-specific unit/integration and Playwright coverage.
- Role, capability, tenant, navigation, filtering, sorting, pagination, persistence, upload, and error-path checks as applicable.
- Desktop/tablet/mobile visual comparisons and keyboard checks.
- No production PHI in fixtures, output, traces, videos, or screenshots.

### Rollback

Migrate one screen or coherent workflow surface per commit. Avoid simultaneous refactors of presentation and business logic. Maintain old composition until the replacement has passed its acceptance gate when feasible.

### Explicit approval checkpoint

Approve each screen batch from the baseline inventory. A phase-level approval does not authorize migration of every screen.

## Phase 5 — Automated governance

Status: **Optional future phase**

### Potential scope

- A synthetic component showcase or development-only catalog.
- Targeted visual regression and automated accessibility checks.
- Desktop and mobile Playwright projects for representative routes.
- Scoped lint or repository rules that prevent new manual modal shells, ordinary duplicated buttons, or unapproved status maps.
- Documented exception and variant ownership.

### Expected benefits

- Earlier detection of accessibility and visual drift.
- Lower review cost for shared-component changes.
- Prevents new debt after the highest-value migration work is complete.

### Major risks

- Unstable data and animations can create noisy snapshots.
- Enforcement added too early can generate broad false positives and encourage bypasses.
- A catalog can drift if it does not use production primitives directly.

### Dependencies

- Stable component APIs and deterministic synthetic fixtures.
- Agreed exception process and ownership.
- CI capacity and an approved choice of tooling; dependency installation is a separate approval.

### Effort estimate

Medium: approximately 5–10 engineering days after foundations stabilize. This is an estimate, not a guarantee.

### Validation requirements

- Prove new checks catch an intentional test defect and remain deterministic across repeated runs.
- Begin with changed files or named reference routes before expanding scope.
- Measure false positives and runtime before making checks blocking.

### Rollback

Introduce each check independently and initially as advisory when appropriate. Disable or revert a noisy rule without removing established design-system documentation or components.

### Explicit approval checkpoint

Approve tooling, dependencies, CI cost, data handling, and enforcement scope separately. Do not make a new check blocking until its reliability is demonstrated.

## Current recommendation after Phase 1

**PROCEED SELECTIVELY.** The audit shows enough benefit to justify a narrowly scoped Phase 2 that adds semantic aliases while preserving rendered values and consolidates only low-risk theme plumbing. Do not include the global 14px root change, broad screen restyling, modal focus behavior, shared-component API changes, or screen migration in that authorization.

Before Phase 2, approve the exact token inventory, compatibility strategy, representative synthetic baseline method, and rollback boundary. If safe visual baselines cannot be established, reduce Phase 2 to documentation and nonvisual aliases with focused source-level verification.
