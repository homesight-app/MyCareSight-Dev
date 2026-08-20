# HIPAA Compliance Log

This document records features and implementations that address HIPAA Security Rule
(45 CFR § 164.312) requirements. It is maintained by Claude Code alongside feature
development and is intended to serve as a living evidence trail for compliance officers
and auditors.

---

## Provision Reference

| Provision | Requirement |
|-----------|-------------|
| § 164.312(a)(1) | Access Control — implement technical policies to allow only authorized persons or software programs to access ePHI |
| § 164.312(a)(2)(i) | Unique User Identification — assign a unique name or number to identify and track user identity |
| § 164.312(a)(2)(ii) | Emergency Access Procedure — establish procedures for obtaining ePHI during an emergency |
| § 164.312(b) | Audit Controls — implement hardware, software, and procedural mechanisms to record and examine activity in systems that contain or use ePHI |
| § 164.312(c)(1) | Integrity — implement policies and procedures to protect ePHI from improper alteration or destruction |
| § 164.312(d) | Person/Entity Authentication — implement procedures to verify that a person seeking access is the one claimed |
| § 164.312(e)(1) | Transmission Security — implement technical security measures to guard against unauthorized access to ePHI transmitted over electronic communications networks |

---

## § 164.312(b) — Audit Controls

### Internal Note Search Audit (pre-existing, date unknown)
- **What:** Every search of `internal_notes` ≥ 3 characters triggers a debounced audit log entry.
- **Files:** `src/app/actions/internal-notes.ts` → `logNoteSearchAction`
- **Audit row:** `action='SEARCH'`, `table_name='internal_notes'`, `details: { search_term, results_returned, subject_type, subject_id }`
- **Why it matters:** Allows auditors to reconstruct who searched for what PHI and what was returned (HIPAA investigation traceability).

### People Tab — Permission Change Audit (2026-08-19)
- **What:** Every permission-change and access-grant operation in the Unified Agency People Table writes an `audit_log` row.
- **Covered operations:**
  - Add key staff / officer → `action: 'CREATE_KEY_STAFF'`
  - Add member/owner → `action: 'CREATE_MEMBER_OWNER'`
  - Update key staff info → `action: 'UPDATE_KEY_STAFF'`
  - Grant system access (promote to credentialed user) → `action: 'GRANT_SYSTEM_ACCESS'`
  - Status toggle active/inactive (agency admin) → `action: 'UPDATE_STATUS'`
  - Status toggle active/inactive (care coordinator) → `action: 'UPDATE_STATUS'`
- **Pre-existing gaps fixed:** `updateAgencyAdminStatus` and `updateCareCoordinatorStatus` in `agency-users.ts` were missing audit logging — corrected as part of this feature.
- **Files changed:** `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`
- **Audit row shape:** `{ agency_id, table_name, record_id, action, performed_by_user_id, details: { old_status?, new_status?, credential?, officer_role?, full_legal_name?, changed_fields? } }`

### Login Audit Trail — `last_login_at` (2026-08-19)
- **What:** `user_profiles.last_login_at` (timestamptz, nullable) added to the schema. Updated to the current timestamp on every successful `signIn()` call.
- **Files changed:** `supabase/migrations/phase_two/162_user_agency_roles_phase_a.sql` (ADD COLUMN), `src/lib/auth.ts` (update on sign-in)
- **Audit row:** Column on `user_profiles` — no separate log row needed; the value is an authoritative, server-written timestamp that cannot be set by the user.
- **Why it matters:** Provides an auditable record of when each user last authenticated, enabling investigation of unauthorized access and session anomalies.

---

## § 164.312(a)(1) — Access Control

### Permission Centralization — `requirePlatformStaffOrAgencyRole` (2026-08-19)
- **What:** Replaced three separate copy-pasted inline permission helpers in `agency-users.ts`, `agency-onboarding.ts`, and `agency-people.ts` with a single authoritative function in `src/lib/permissions.ts`. All agency-scoped server actions now go through one audit point.
- **Files changed:** `src/lib/permissions.ts` (new), `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`, `src/app/actions/agency-people.ts`
- **Why it matters:** A single permission function means access-control logic can be audited, tested, and corrected in one place rather than across N files that may drift out of sync.

### Account Lockout — `is_active` (2026-08-19)
- **What:** `user_profiles.is_active` (boolean NOT NULL DEFAULT true) added to schema. When set to `false`: (1) `requirePlatformStaffOrAgencyRole` returns Forbidden before any DB query executes, (2) `is_platform_staff()` RLS function denies all table access, (3) `has_agency_role()` RLS function denies all agency-scoped access. Deactivation takes effect immediately with no login session invalidation needed.
- **Files changed:** `supabase/migrations/phase_two/162_user_agency_roles_phase_a.sql` (ADD COLUMN, update `has_agency_role()`), `supabase/migrations/phase_two/163_rls_functions_phase_b.sql` (update `is_platform_staff()`), `src/lib/permissions.ts` (application-layer check)
- **Gap fixed:** Prior to this, deactivating a user required updating status in each of `agency_admins`, `care_coordinators`, and `caregiver_members` separately — none of which blocked login or prevented API access.
- **Why it matters:** Satisfies the requirement to revoke ePHI access immediately when a workforce member's authorization changes or employment ends.

### Agency People Self-Management (2026-08-19)
- **What:** `requireAdminOrAgencyOwner(agencyId)` helper added to `agency-users.ts` and `agency-onboarding.ts`. All people-management server actions now enforce that callers are either platform staff (admin/expert) or the `company_owner` of that specific agency. Cross-agency access returns Forbidden.
- **Files changed:** `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`
- **RLS policies added:** `agency_key_staff_agency_admin_select`, `agency_key_staff_agency_admin_insert`, `agency_key_staff_agency_admin_update`, `care_coordinators_agency_admin_select`, `care_coordinators_agency_admin_update` — all scoped via `hs_is_agency_admin(agency_id)`.
- **Why it matters:** Ensures agency owners can self-manage their own team without platform-admin involvement while preventing any cross-agency data access.
