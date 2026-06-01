# Decision: Fix tenant RLS migration ordering

- **Date:** 2026-06-01
- **Requested by:** saitcho
- **What:** Fixed migration ordering for tenant RLS.
- **Why:** The `tenant_rls` migration referenced tables that did not yet exist on a fresh PostgreSQL database, which broke clean bootstrap runs.
- **How:** The migrator now loads migration files in deterministic filename order, the tenant RLS migration now creates or guards prerequisite subscription/webhook/metering tables before applying tenant columns and RLS policies, and the API test suite now asserts a fresh database can bootstrap the full table set.
