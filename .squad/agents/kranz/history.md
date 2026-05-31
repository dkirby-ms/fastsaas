# Kranz — History

## Project Context
- **Project:** FastSaaS — Next-gen Microsoft Commercial Marketplace SaaS accelerator
- **Stack:** Node.js 22, TypeScript, Next.js + React + Tailwind, PostgreSQL + Prisma, Turborepo monorepo
- **Deployment:** Azure Container Apps (default), App Service migration path
- **User:** dkirby-ms
- **Design doc:** `docs/design-document.md`

## 2026-05-29 to 2026-05-30 Session Summary

Completed comprehensive Phase 1 review cycle:
- **PR Reviews:** #6, #7, #8, #9, #10 (all initially rejected, all approved after team fixes)
- **Pattern Enforcement:** Infrastructure toggle bidirectionality, auth/token production alignment, marketplace API v2 compliance, webhook security, idempotency, durability
- **Issue Triage:** Created squad routing labels and assigned Phase 1 issues to squads
- **Infrastructure:** Approved PR #14 (Bicep dependency fixes), PR #24 (optional private endpoints), PR #28 (staging bootstrap fix with region optimization and Redis workaround)
- **Team Skill:** Defined Team Commentary Skill for lightweight cross-agent sharing of findings

See `.squad/agents/kranz/history-archive.md` for detailed 2026-05-29 and 2026-05-30 session notes.

## 2026-05-31 Current Session

### Issue Triage — Morning
- Approved PR #28 merge (staging bootstrap with centralus region, staging-scoped Redis disable)
- Approved Ralph's issue closures: #25 (resolved), #26 (resolved), #27 (stale)

### PR #29 Review — Azure Managed Redis Migration (2026-05-31T11:25:29Z)
- **Status:** APPROVED
- **Migration Details:** Bicep updated from retired Azure Cache for Redis to `Microsoft.Cache/redisEnterprise`
- **Validation:** Resource type/API/SKU correct, private DNS zone updated, database child resource encrypted on port 10000, REDIS_URL properly wired
- **Cleanup:** `deployRedis` workaround fully removed from main.bicep, parameters, and both staging workflows
- **Quality Checks:** Bicep validates cleanly, npm typecheck passes, no regressions
- **Status:** Ready for merge

## Architecture Patterns Established (2026-05-29 to 2026-05-31)

1. **Infrastructure Toggle Pattern:** Public/private mode toggles must implement both negative logic (remove isolation resources) and positive logic (enable access)
2. **Auth Trust Model:** Production deployments use RS256 + JWKS; dev uses scoped bypass only
3. **Webhook Security:** HMAC-SHA256 with timing-safe comparison, configurable replay windows
4. **Marketplace Compliance:** Fulfillment API v2 (activate/unsubscribe/update/reinstate) with proper payloads
5. **Durability:** Outbox pattern with atomic claiming, concurrency control, restart safety

## Active Decisions

- Central Azure region (centralus) for staging deployment
- Scoped infrastructure workarounds only; shared template defaults preserved
- Two-phase Bicep strategy for infrastructure provisioning
- Azure Managed Redis as replacement for retired Azure Cache for Redis
