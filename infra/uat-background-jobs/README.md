# UAT background-job infrastructure

This resource-group-scoped Bicep template targets `rg-mycaresight-uat` in West US 2.
It creates a Flex Consumption Function App, dedicated job storage and queue, a
user-assigned identity, Key Vault, Log Analytics, and Application Insights.

The template creates no secrets. Every function and the application-level job switch
start disabled. The storage account disallows shared-key authorization and public blob
access; the Function host, queue binding, deployment container, Key Vault, and telemetry
use the assigned identity and Azure RBAC.

## Controlled deployment

1. Run a resource-group what-if and review every proposed resource and role assignment.
2. Deploy the template only after review.
3. In the new Key Vault, create these secrets without pasting values into GitHub or a
   shell command:
   - `uat-jobs-database-url`: the pooled Neon UAT `mycaresight_jobs` URL.
   - `uat-mailgun-api-key`: the existing UAT Mailgun API key.
   - `uat-mailgun-domain`: the existing UAT Mailgun domain.
   - `uat-mailgun-from-email`: the existing UAT sender address.
4. Confirm all four Function App Key Vault references resolve successfully.
5. Deploy code while all `AzureWebJobs.<functionName>.Disabled` settings remain `true`
   and `JOBS_ENABLED=false`.

Role-assignment creation requires Owner, User Access Administrator, or an equivalent
custom permission at the resource-group scope. Do not add PHI to app settings, queue
messages, deployment parameters, logs, or resource tags.
