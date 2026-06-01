---
name: "portal-rbac-routing"
description: "Route customer and publisher portal users from shared auth session claims"
domain: "frontend-auth"
confidence: "high"
source: "observed"
---

## Context
Use this when one Next.js portal hosts multiple role-specific experiences behind the same Auth.js session and API token.

## Patterns
- Decode role claims from the access token once in `auth.ts` and persist normalized roles onto the NextAuth JWT/session.
- Keep one route shell, but gate role-specific paths with small server-side helpers that redirect unauthorized users to their default home.
- Drive navigation from session roles so publisher users never see customer-only links.
- Keep API access behind one client abstraction and return friendly 403 states in page clients.

## Examples
- Session role extraction: `packages/portal/auth.ts`
- Route guards: `packages/portal/lib/route-access.ts`
- Role-aware nav: `packages/portal/components/sidebar-nav.tsx`
- Friendly forbidden UI: `packages/portal/components/forbidden-state.tsx`

## Anti-Patterns
- Checking roles only in client components and allowing server-rendered routes to flash before redirect.
- Duplicating auth logic in every page instead of using shared route guard helpers.
- Hiding nav items without also handling 403 API responses gracefully.
