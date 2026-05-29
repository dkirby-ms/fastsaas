# Squad Decisions

## Active Decisions

### Phase 1 Issue Triage & Squad Routing

**Date:** 2026-05-29  
**Owner:** Kranz (Lead)  
**Status:** Active

#### Assignment

| Issue | Title | Squad | Blocking | Dependencies |
|-------|-------|-------|----------|--------------|
| #1 | API foundation and auth baseline | EECOM | Yes (all P1 backend) | None |
| #2 | Subscription lifecycle and fulfillment | EECOM | Yes (revenue flow) | #1 |
| #3 | Metering ingestion and submission | EECOM | Yes (revenue recognition) | #1 |
| #4 | Customer portal MVP | FIDO | No (can prototype) | #1 (API contracts) |
| #5 | Containerized staging deployment | GNC | No (integration phase) | #1, #2, #3 (stable) |

#### Rationale

- **#1 → EECOM (critical):** API foundation is the bedrock. All backend work depends on Express scaffolding, tenant context, and middleware. Must ship first.
- **#2 → EECOM:** Subscription state machine and marketplace integration—core business logic. Depends on API routes being available.
- **#3 → EECOM:** Metering pipeline (ingestion, idempotency, retries, DLQ)—parallel with #2 after #1 ships. Both can start together.
- **#4 → FIDO:** Portal UI work. Can prototype against API contracts from #1, but integrate after backend routes stabilize. Reduces backend pressure.
- **#5 → GNC:** Infrastructure. Can scaffold Docker/Bicep early, but full staging deployment validates after #1-#3 are ready.

#### Execution Sequence

1. **Immediate:** EECOM starts #1 (API foundation)
2. **After #1:** EECOM + FIDO work in parallel
   - EECOM: #2 (subscription) and #3 (metering)
   - FIDO: #4 (portal) with API integration
3. **Integration:** GNC ships #5 (staging) with all components

#### Labels

Created squad routing labels for future issue triaging:
- `squad` (meta-label for all squad work)
- `squad:eecom` (Backend)
- `squad:fido` (Frontend)
- `squad:gnc` (DevOps)
- `squad:retro` (Tester)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
