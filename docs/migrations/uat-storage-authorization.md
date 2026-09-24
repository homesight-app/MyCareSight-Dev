# UAT Azure storage authorization boundary

Status: prepared locally on 2026-09-23. No database migration is required. Live Azure upload, download, cleanup, managed-identity, container-privacy, and malware-scanning acceptance remain pending.

## Result

Private-object downloads now pass through an application-owned storage boundary. The signed-URL route accepts a bucket and stored path only as a lookup key, resolves that exact path to its owning database record, reloads the active actor and membership, and signs the object only after record and agency authorization. Signed URLs default to 10 minutes and are capped at 15 minutes.

Browser uploads no longer choose a container or object path. They send a narrow purpose and resource identifier. The server verifies access to that resource, selects the Azure container, generates an opaque UUID object name, validates a 10 MB server-side size limit and allowlisted media type, uploads, and records identifier-only audit evidence. If the later database insert fails, the browser can delete only that newly uploaded object using a signed 15-minute cleanup token bound to the actor and exact object.

The old provider-named `src/lib/supabase/storage.ts` helper was removed. Shared bucket names, upload contracts, signed-URL requests, Azure server operations, authorization, and cleanup-token logic now live under `src/lib/storage/`.

## Access rules

- Application documents: platform admin, assigned expert, owning company owner, active matching agency manager, or the active caregiver linked to that application.
- License documents: platform admin/expert, owning company owner, active matching agency manager, or the active caregiver linked to that license.
- Caregiver certifications: only an active caregiver profile linked to the current user may create its upload scope.
- Patient incidents and patient documents: platform admin/expert or active matching agency manager.
- Agency and lead documents: platform admin or active matching agency manager.
- License requirement and playbook templates: exact recorded paths may be downloaded by an active user; new template uploads require platform admin authorization.
- Public agency logos remain plain public URLs and are outside private-object signing.

Missing and inaccessible private objects both return `404` to avoid disclosing record existence. Audit details contain only operation names and identifiers; object paths and original filenames are excluded.

## Corrected defect

The stale caregiver license component previously uploaded a license file and inserted its metadata into `application_documents` with a license ID in the application foreign-key field. It now writes `license_documents` and uses the license-specific authorization scope.

## Validation

- Nine focused storage authorization and cleanup-token tests pass, including cross-agency denial, inactive-caregiver denial, admin-only template scopes, token tampering, and expiry.
- TypeScript passes.
- Source scans find no caller-supplied upload bucket/path, no direct Supabase Storage SDK call, and no import of the removed Supabase-named storage helper.
- Standard ESLint remains blocked by the repository's existing ESLint 9 flat-config mismatch.

## Remaining gates

Before UAT can accept PHI-bearing documents, verify all Azure containers except the explicit public-logo container are private, App Service managed identity has only required blob permissions, authorized upload/download/cleanup work for each role, cross-agency requests fail, and storage audit rows are written. Enable and validate malware scanning/quarantine before accepting PHI-bearing uploads. Existing source objects still require a separately controlled copy/reconciliation step; this change does not copy data.

Supabase storage variables and packages must remain until the remaining direct Supabase database callers are removed and the final no-Supabase build passes.

