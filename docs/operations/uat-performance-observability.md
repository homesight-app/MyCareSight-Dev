# UAT Web Performance Observability

This runbook covers the Azure App Service web application named `mycaresight-uat`.
The background-jobs Function App has a separate Application Insights resource and
is outside this procedure.

Use synthetic UAT records only. Performance telemetry must not contain names,
filenames, storage paths, SQL text, request bodies, form values, or document content.

## Deployment configuration

The UAT deployment workflow enables the App Service-managed Node.js Application
Insights agent when `APPLICATIONINSIGHTS_CONNECTION_STRING` is already present on
the web app. The workflow never reads or prints the setting value.

Verify the setting names from Cloud Shell:

```bash
APP_NAME="mycaresight-uat"
RESOURCE_GROUP="$(az webapp list --query "[?name=='${APP_NAME}'].resourceGroup | [0]" -o tsv)"

az webapp config appsettings list \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?name=='APPLICATIONINSIGHTS_CONNECTION_STRING' || name=='ApplicationInsightsAgent_EXTENSION_VERSION'].{name:name,present:value!=''}" \
  --output table
```

Expected result:

| Setting | Present |
| --- | --- |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | `true` |
| `ApplicationInsightsAgent_EXTENSION_VERSION` | `true` |

If the connection string is absent, enable Application Insights for the UAT web
app in Azure before treating this performance gate as complete. Do not paste the
connection string into a terminal transcript, ticket, chat, or repository.

## Telemetry boundaries

The managed agent records inbound server requests and supported outbound
dependencies. The application also emits correlated custom dependency spans for:

- `mycaresight.neon.transaction`
- `mycaresight.azure_blob.upload`
- `mycaresight.azure_blob.delete`
- `mycaresight.azure_blob.sign_url`

Custom spans contain operation status and duration. Upload spans contain only a
size class. They never contain record IDs, tenant IDs, user IDs, URLs, paths,
filenames, SQL text, parameters, exception text, or file contents.

## UAT queries

Run these in the **web application's** Application Insights Logs view.

Page and Server Action latency over the last hour:

```kusto
requests
| where timestamp > ago(1h)
| summarize
    requests=count(),
    failures=countif(success == false),
    p50_ms=percentile(duration / 1ms, 50),
    p95_ms=percentile(duration / 1ms, 95),
    maximum_ms=max(duration / 1ms)
  by operation_Name
| order by p95_ms desc
```

Application-owned Neon and Blob timings:

```kusto
dependencies
| where timestamp > ago(1h)
| where name startswith "mycaresight."
| extend
    component=tostring(customDimensions["mycaresight.component"]),
    operation=tostring(customDimensions["mycaresight.operation"]),
    size_class=tostring(customDimensions["mycaresight.size_class"])
| summarize
    calls=count(),
    failures=countif(success == false),
    p50_ms=percentile(duration / 1ms, 50),
    p95_ms=percentile(duration / 1ms, 95),
    maximum_ms=max(duration / 1ms)
  by component, operation, size_class
| order by p95_ms desc
```

Slow request correlation with custom dependencies:

```kusto
let slowRequests = requests
| where timestamp > ago(1h)
| where duration > 1s
| project operation_Id, request_name=name, request_duration_ms=duration / 1ms;
slowRequests
| join kind=leftouter (
    dependencies
    | where name startswith "mycaresight."
    | project operation_Id, dependency_name=name, dependency_duration_ms=duration / 1ms, success
  ) on operation_Id
| order by request_duration_ms desc, dependency_duration_ms desc
```

## Acceptance check

1. Deploy the web application and confirm the two settings above are present.
2. Use a synthetic account to open Playbooks, navigate elsewhere, and return.
3. Upload one synthetic document in each size class needed for testing.
4. Wait up to five minutes for telemetry ingestion.
5. Run the request and dependency queries.
6. Confirm request rows correlate to Neon and Blob spans through `operation_Id`.
7. Confirm no trace, dependency name, or custom dimension contains submitted data,
   a filename, storage path, SQL statement, database parameter, or provider error.

This evidence identifies where time is spent. It does not by itself approve the
environment for PHI or replace BAA, retention, access-control, and alerting gates.
