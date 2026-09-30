# UAT date representation audit

Reviewed 2026-09-30. This is a targeted code and catalog audit, not a full browser
acceptance result. No business records were retrieved or modified.

## Cause

The web database adapter uses postgres.js without date parser overrides. Its
installed default parser converts PostgreSQL DATE, TIMESTAMP, and TIMESTAMPTZ
into JavaScript Date objects. The former JSON-based Supabase boundary supplied
strings. Several migrated query functions still return raw driver rows cast to
string-based interfaces or `any[]`; these assertions do not convert values.
React server/client boundaries can preserve Date objects, so they do not provide
the missing normalization. Hosting on Azure rather than Vercel is not itself the
cause of this representation mismatch.

## Verified vulnerable paths

Live Neon UAT information_schema metadata confirms the referenced DATE columns.
Synthetic values passed through the installed driver's date parser reproduce the
listed string-operation failures or comparison mismatch.

| Workflow | Producer and consumer | Finding |
| --- | --- | --- |
| Lead Tasks | `getLeadTasks` -> `LeadDetailContent` | Due dates now leave the repository as YYYY-MM-DD strings; task timestamps leave as strings. |
| Admin revenue | `getLeads` -> `src/app/pages/admin/reports/revenue/page.tsx` | Lead calendar dates and timestamps are normalized before revenue sorting and month grouping. |
| Certifications | `getAgencyCertificationsWithHistory` -> `AgencyCertificationsContent`, `AgencyDetailContent`, `CertificationDetailModal`; raw license readers -> `CreateLicenseModal` | License calendar dates and timestamps are normalized across shared license reads and insert returns. |
| Admin billing | `getCasesOrderedByStartedDate` -> billing page -> `BillingContent` | Case start dates and timestamps are normalized across shared case reads. |
| Caregiver availability | `getCaregiverAvailabilitySlots` -> `CaregiverMyCalendarContent` | Specific and recurrence dates now use YYYY-MM-DD; timestamps use ISO strings. |
| Caregiver editing | caregiver-member reads -> `EditStaffModal` | Shared caregiver and user reads now normalize start dates and timestamps. |
| Newly created patients | `insertPatient` -> `mapInsertedPatientToListPatient` | Patient reads and mutation returns normalize DOB/start dates and timestamps; the list mapper also accepts driver-shaped Date objects defensively. |

The audit proves mismatched runtime contracts, not that every listed path has
already failed in the deployed UAT build. Exact browser failures and affected
record counts were not collected.

## Paths already handling this mismatch

- Internal-note reads cast creation/update timestamps to text before returning rows.
- Caregiver pay-rate reads cast effective dates and creation timestamps to text.
- Patient service-contract list reads explicitly return text dates/timestamps.
- The shared `formatDate` helper accepts strings and Date objects, although a
  calendar date must still be distinguished from an instant to avoid day shifts.

These observations are scoped to the inspected read paths, not blanket acceptance
of each domain's reads and mutations. SQL JSON aggregation also returns nested
dates as strings, so one result can mix nested strings with top-level Date objects.

## Implemented contract and remaining acceptance

`src/lib/database-date-contract.ts` now defines the application boundary:
calendar dates are YYYY-MM-DD, instants are ISO timestamp strings, and nulls are
preserved. The affected shared repository readers and relevant mutation returns
use that boundary. Time-only columns remain time strings from PostgreSQL. The
driver's global parsers were not changed, which limits the blast radius for
server code that intentionally works with Date objects.

The follow-up string-operation scan covered staff date forms, patient insertion
mapping, direct date sorting, scheduling helpers, and recurrence consumers. The
known raw-driver paths from this audit are covered by regression tests using Date
objects, nulls, already serialized strings, and populated lists. Existing
scheduling readers already normalize dates locally; internal notes, pay rates,
and service contracts use SQL text casts.

UAT browser acceptance remains required after deployment for lead tasks, revenue,
certification editing/sorting, billing month filtering, caregiver availability,
caregiver editing, and patient creation. Worker-only date behavior should remain
part of each job's acceptance because workers have a separate deployment artifact.
No Supabase or Neon schema change is proposed.
