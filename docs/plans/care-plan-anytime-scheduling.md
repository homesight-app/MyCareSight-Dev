# Care-Plan Anytime Scheduling

Status: implemented locally; UAT browser acceptance and deployment pending  
Recorded: 2026-10-21

## Decision

For ADL, IADL, and skilled-task schedules, a daily frequency can be set without selecting a time window. A visit shows one task labeled with that frequency (for example, **Anytime · 2×**); it does not create two separately assignable or checkable occurrences. This distinction must remain clear to staff: one completion control does not prove that two performances occurred.

## Proposed behavior

1. The shared Select Time dialog offers **Anytime** and **Specific time windows** as explicit choices. Times per Day (1–4) is available in either mode. The dialog defaults to Anytime, 1× when enabling an unscheduled day.
2. Saving Anytime requires no selected window. It stores an active schedule with the chosen `times_per_day` and no morning, afternoon, evening, or night slot. Opening an existing Anytime schedule restores its frequency; a legacy active schedule with null frequency displays as 1×.
3. Specific time windows still require at least one selected window. Switching modes updates the saved schedule without leaving stale window values. The existing per-window Always/As Needed meaning remains separate from the daily Anytime choice.
4. Selecting a row's **All** control enables all seven days. Newly enabled days default to Anytime, 1×; already enabled days retain their custom schedule and frequency. All stays selected while every day is enabled, even if individual days differ. Selecting All again when all seven are enabled disables the seven days while retaining task notes.
5. The weekly grid, visit assignment, and caregiver execution display the daily frequency clearly. Anytime N× remains one visit task and one assignment token. New visit assignments snapshot N in the token so later care-plan edits do not silently relabel a visit. Existing unassigned-task counts continue to count that task once, regardless of N.

## Implementation boundaries

The shared dialog and both row-All handlers are in `src/components/ClientDetailContent.tsx`. Currently a day with no selected slot saves as `never`, and All hard-codes Morning, 1×. The implementation must update dialog state/hydration, the local schedule writer, row-All behavior, summaries, and downstream visit/caregiver labels together. Preserve the current save boundary, tenant authorization, task identity, and audit behavior.

Before changing persistence, verify the live UAT Neon schema and constraints for both daily schedule tables. Existing local schema files are not authoritative. If a production Supabase change is later contemplated, verify its live schema separately through the approved connection; this plan does not authorize production access or deployment.

## Acceptance checks

- For an ADL, an IADL, and a skilled task: set Anytime, 2×; save, refresh, and confirm the frequency and no chosen window persist.
- Select All, edit one day to a specific window or a different frequency, save, refresh, and confirm that day differs while All remains selected.
- Confirm All preserves previously customized active days and that toggling a fully enabled row off disables all seven days without deleting notes.
- Switch Anytime → specific windows → Anytime and confirm no stale windows remain.
- Confirm legacy active schedules with null frequency display as 1×.
- Confirm visit assignment and caregiver task display show **Anytime · N×** as one task; verify keyboard operation and existing save-error behavior.

The local application implementation changes only the existing care-plan editor, visit-task token formatting, caregiver task labels, and focused tests. It does not include a schema migration, environment change, or deployment.
