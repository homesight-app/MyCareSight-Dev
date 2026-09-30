# Agency Website Lead API

The Agency Website Lead API accepts server-to-server contact-form submissions and creates records in the existing agency lead pipeline.

## Endpoint

```text
POST /api/integrations/v1/leads
Content-Type: application/json
Authorization: Bearer <agency API key>
Idempotency-Key: <unique submission identifier>
```

The API key selects the agency. Requests cannot provide or override `agency_id`, `lead_type`, `stage`, `status`, or `source`.

Each accepted submission creates an existing `leads` row with:

- `lead_type = patient`
- `agency_id` from the credential
- the agency's configured entry stage, falling back to `new`
- `status = active`
- `source = Website`

## Request body

```json
{
  "firstName": "Synthetic",
  "lastName": "Prospect",
  "email": "prospect@example.test",
  "phone": "(555) 555-0100",
  "companyName": "",
  "serviceType": "companion",
  "message": "Please contact me about companion care.",
  "smsConsent": false,
  "address1": "",
  "address2": "",
  "city": "",
  "state": "",
  "zip": ""
}
```

`firstName`, `lastName`, and `email` are required. Accepted `serviceType` values are `companion`, `personal_care`, `skilled_nursing`, `therapy`, and `other`. Unknown request fields are rejected.

The body limit is 32 KiB. Names, email addresses, phone numbers, addresses, messages, and request bodies must never be placed in application, website, proxy, or monitoring logs.

## Idempotency

Generate one stable identifier when the website accepts the form and send it as `Idempotency-Key` on every retry. A UUID is recommended.

- First accepted request: `201`, `duplicate: false`
- Same key and same body: `200`, the original `leadId`, `duplicate: true`
- Same key with a changed body: `409 idempotency_conflict`

Only a SHA-256 hash of the idempotency key is stored.

## Example

Run this only from the website's server. Never embed the API key in browser JavaScript, HTML, a mobile application, or a public repository.
The external website remains responsible for its own form CSRF protection, bot challenge, consent text, and abuse controls before it calls this service.

```bash
curl --request POST \
  --url "https://mycaresight-uat.azurewebsites.net/api/integrations/v1/leads" \
  --header "Authorization: Bearer $MYCARESIGHT_LEAD_API_KEY" \
  --header "Content-Type: application/json" \
  --header "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  --data '{
    "firstName": "Synthetic",
    "lastName": "Prospect",
    "email": "prospect@example.test",
    "phone": "(555) 555-0100",
    "serviceType": "companion",
    "message": "Synthetic UAT submission",
    "smsConsent": false
  }'
```

Successful response:

```json
{
  "accepted": true,
  "duplicate": false,
  "leadId": "00000000-0000-4000-8000-000000000000"
}
```

## Responses

| Status | Meaning | Website behavior |
|---|---|---|
| `201` | Lead created | Show success |
| `200` | Retry matched an existing delivery | Show success |
| `400` | Invalid JSON, fields, or idempotency key | Do not retry until corrected |
| `401` | Missing, invalid, expired, or revoked API key | Alert the integration operator |
| `403` | Agency is unavailable | Alert the integration operator |
| `409` | Idempotency key was reused with changed content | Generate a new key only for a genuinely new submission |
| `413` | Body exceeds 32 KiB | Reduce the request |
| `415` | Content type is not JSON | Send `application/json` |
| `429` | Rate limit reached | Retry after the `Retry-After` interval |
| `503` | Temporary service failure | Retry with exponential backoff and the same idempotency key |

## Credential lifecycle

After migration 017 is applied, a platform administrator can open:

```text
Admin → Agency → Organization → Plan & Access → Website Lead Integration
```

Creating a credential displays the API key once. Store it in the external website's server-side secret manager. The database stores only its hash and a non-secret prefix. Revocation takes effect on the next request and is recorded in the audit log.

Use one credential for each deployed website or environment. Do not reuse UAT credentials in production.

## Deployment and acceptance

1. Deploy the web application with `WEBSITE_LEAD_INTEGRATION_ENABLED=false` or unset. The endpoint returns `503` and the credential UI remains hidden.
2. Apply `scripts/migrations/017-website-lead-integration.sql` to the target Neon database.
3. Run `scripts/migrations/017-verify-website-lead-integration.sql`; every result must be `true`.
4. Set the web App Service setting `WEBSITE_LEAD_INTEGRATION_ENABLED=true` and restart the web application.
5. Create a UAT credential from the agency record and store it server-side on the external website.
6. Submit synthetic contact data and verify one agency lead appears with source `Website`.
7. Retry with the same idempotency key and verify no second lead is created.
8. Revoke the credential and verify the endpoint returns `401`.

Do not submit real patient or prospect information until the applicable HIPAA, BAA, security, and operational gates are complete.
