# UAT agency personnel private details

Migration 026 adds optional birth date, hire date, home address, and encrypted SSN storage for credentialed agency personnel. It applies to company owners, care coordinators, and caregivers while keeping high-risk identifiers out of routine profile and scheduling queries.

## Data and access model

- `agency_personnel_private` has one record per `(agency_id, user_id)` and uses foreign keys to the authoritative agency and user profile.
- Platform administrators and active exact-role agency owners can edit all fields. Active care coordinators can view the masked SSN suffix and birth date and can edit hire date and home address. Experts and caregivers do not receive this management access.
- A database trigger independently prevents care coordinators from inserting or changing DOB and SSN columns through the shared runtime role.
- Full SSNs are never returned by the profile read action. The UI displays only the separately stored last four digits and requires the complete value to replace an SSN.
- Legacy key-staff reads use an explicit safe projection, so encrypted SSN envelopes and key identifiers are not serialized into onboarding or agency-detail browser props.
- The caregiver address mirror remains synchronized for proximity matching. The structured private-personnel address is authoritative for the personnel workflow.
- Existing credentialed `agency_key_staff` details are backfilled. Existing SSN ciphertext is marked with the legacy key identifier and remains readable for controlled rotation.

## Encryption boundary

`src/lib/security/sensitive-field-cipher.ts` defines the application-owned cipher and key-provider contracts. AES-256-GCM runs only on the server with a new 96-bit nonce for every encryption. The versioned envelope contains the algorithm, key identifier, nonce, authentication tag, and ciphertext. Authenticated additional data binds the value to its deployment environment, agency, record, and field purpose.

Deployed Azure environments use `SENSITIVE_DATA_KEY_PROVIDER=azure-key-vault`. `DefaultAzureCredential` obtains a token for the configured environment-specific Key Vault, which means App Service uses Managed Identity without a stored Azure credential. The app reads the latest secret version for new encryption and the recorded historical version for decryption. Active-key caching is bounded to five minutes so rotation is discovered without restarting every instance.

If migration 026 finds legacy three-part SSN ciphertext, place the former AES key in a separate Key Vault secret and configure `SENSITIVE_DATA_LEGACY_KEY_SECRET_NAME` until every legacy value has been replaced or rotated. The old key remains in Key Vault and is never stored in App Service settings. Do not disable or delete that secret while any row has `ssn_key_id = 'legacy'`.

Local development and automated tests use `SENSITIVE_DATA_KEY_PROVIDER=environment` with a dedicated non-production key map. `AGENCY_SSN_KEY`, `SSN_ENCRYPTION_KEYS`, and `SSN_ACTIVE_KEY_VERSION` remain transitional read compatibility only and must not be introduced into new deployed configuration.

## Azure configuration gate

Before deploying the matching application code to an Azure environment:

1. Use a separate Key Vault and AES data key for that environment. Never reuse Development, UAT, or Production key material.
2. Enable a system-assigned or approved user-assigned Managed Identity on the App Service.
3. Grant that identity the least-privilege Key Vault secret-read role for the required vault/secret. Application operators do not need permission to read the secret value.
4. Configure `SENSITIVE_DATA_KEY_PROVIDER=azure-key-vault`, `SENSITIVE_DATA_ENVIRONMENT`, `AZURE_KEY_VAULT_URL`, and `SENSITIVE_DATA_KEY_SECRET_NAME` as App Service settings. If the verifier reports legacy ciphertext, also configure `SENSITIVE_DATA_LEGACY_KEY_SECRET_NAME`.
5. Enable Key Vault diagnostic monitoring, soft delete, purge protection, and the approved network restrictions.
6. Keep every historical secret version enabled until all ciphertext using that key ID has been rotated or its retention period has expired.

UAT remains synthetic-only until the BAA, infrastructure, operational, and security gates permit PHI.

## Application order

1. Apply `026-agency-personnel-private-details.sql` using the independent migration owner.
2. Run `026-verify-agency-personnel-private-details.sql` read-only.
3. Configure and test the Key Vault provider before deploying application code that can save SSNs.
4. Deploy the matching application build.
5. Using synthetic records, verify owner and administrator edits, coordinator field restrictions, masked display, cross-agency denial, ciphertext tamper failure, and old-key decryption after a test rotation.

## Rollback

Rollback application code before schema changes. The additive private table and key metadata column may remain access-restricted. Do not drop encrypted records or historical key versions as an application rollback; destructive removal requires a separate retention and recovery decision.
