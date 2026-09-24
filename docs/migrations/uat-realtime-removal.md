# UAT Supabase Realtime removal

Date: 2026-09-23

The seven original Supabase Realtime consumers have been replaced with application-owned polling. Notifications poll every 30 seconds. Message threads and the client application-progress display poll every 15 seconds. Polling pauses for hidden tabs, prevents overlapping requests, and refreshes when the browser regains focus or visibility. Local sends update immediately rather than waiting for the next interval.

Every refresh uses an existing authenticated server action. Message totals use the current-identity PostgreSQL authorization boundary, including active profile and membership checks and identifier-only read auditing. No browser subscription or Supabase Realtime credential remains in application source.

No SQL migration is required. This removes the Realtime reason for retaining Supabase, but direct browser database queries and transitional storage helpers still require the SDK and UAT Supabase environment variables.

Validation: all 192 tests across 22 suites pass, including visible/hidden/focus polling behavior and authorized message-count coverage. TypeScript, focused legacy-config ESLint, whitespace checks, and the production build pass. Existing unrelated React Hook and stale Browserslist warnings remain.
