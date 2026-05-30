# FIDO Portal Modernization Decisions

Date: 2026-05-29T16:53:13.479-05:00
Requested by: Dale Kirby

## Decisions

1. **Auth.js versioning:** Portal auth was migrated to Auth.js v5 patterns, but the npm registry currently resolves `next-auth` through the published `5.0.0-beta.31` release line rather than a stable `5.0.0` tag. We adopted the latest v5 beta available so the portal can use the new `auth.ts` + `handlers` API now.
2. **Portal typecheck command:** `tsc --noEmit` against Next 15 route-generated `.next/types` files fails on this Windows workspace for App Router segment paths. The portal workspace now treats `next build --no-lint --experimental-build-mode compile` as its typecheck command, while `npm run build --workspace=@fastsaas/portal` remains the full production validation step.
3. **Tailwind v4 config shape:** Portal styling now uses CSS-first Tailwind v4 configuration in `app/globals.css` via `@import "tailwindcss"` and `@theme`, with brand colors and `shadow-panel` moved into CSS theme tokens. The legacy `tailwind.config.js` and `postcss.config.js` files were removed.
