# Mock Portal API Pattern

## When to use
Use this pattern when frontend portal screens must ship before backend routes are fully available.

## Pattern
- **Date:** 2026-05-29T14:30:29.387-05:00
- Define shared request/response types in `packages/shared/src/index.ts`.
- Keep one client surface in `packages/portal/lib/api-client.ts` that returns typed data and normalizes user-facing error messages.
- Route mock mode through `packages/portal/lib/mock-api.ts` so components keep using the same API methods and TanStack Query hooks.
- Persist mock state in `localStorage` only inside the mock adapter, not inside page components.
- Invalidate or update React Query caches after mutations so lifecycle actions feel real before backend integration lands.

## Benefits
- Swaps mock data for live APIs with minimal UI churn.
- Keeps error handling consistent across screens.
- Allows dashboard, plan, and settings flows to be validated end-to-end in the browser.
