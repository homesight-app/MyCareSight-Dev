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

---

## § 164.312(a)(1) — Access Control

### Agency People Self-Management (2026-08-19)
- **What:** `requireAdminOrAgencyOwner(agencyId)` helper added to `agency-users.ts` and `agency-onboarding.ts`. All people-management server actions now enforce that callers are either platform staff (admin/expert) or the `company_owner` of that specific agency. Cross-agency access returns Forbidden.
- **Files changed:** `src/app/actions/agency-users.ts`, `src/app/actions/agency-onboarding.ts`
- **RLS policies added:** `agency_key_staff_agency_admin_select`, `agency_key_staff_agency_admin_insert`, `agency_key_staff_agency_admin_update`, `care_coordinators_agency_admin_select`, `care_coordinators_agency_admin_update` — all scoped via `hs_is_agency_admin(agency_id)`.
- **Why it matters:** Ensures agency owners can self-manage their own team without platform-admin involvement while preventing any cross-agency data access.
