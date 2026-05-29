<!-- markdownlint-disable-file -->
# Phase 5: Discover — Follow-Up Work Items

**Date Generated:** May 29, 2026  
**Phase:** 5 (Post-Review Discovery)  
**Total Items:** 16  
**Recommended Duration:** 3-5 weeks (to reach 70/100 readiness for implementation)

---

## Prioritization Framework

**Work is grouped into 5 priority tiers:**
- **Priority 1:** Critical blockers (must complete before implementation start)
- **Priority 2:** Security/operational hardening (high impact, should complete Week 2)
- **Priority 3:** Documentation gaps (important, complete Week 3)
- **Priority 4:** Architecture refinements (valuable, complete Week 4)
- **Priority 5:** Validation & alignment (final checkpoint, complete Week 5)

**Parallel Execution:** Priority 2, 3, 4 items can run in parallel after Priority 1 completes

---

## 🚨 PRIORITY 1: Critical Blockers (Week 1)

### 1.1 Prisma ORM + PostgreSQL RLS Decision

**Status:** 🔲 Not Started  
**Effort:** 4-6 hours  
**Owner:** Architecture team  
**Priority:** BLOCKING (prevents implementation start)

**Objective:**
Resolve the Prisma ORM vs PostgreSQL RLS impedance mismatch by making a binding architectural decision.

**Current State:**
- Design promises RLS enforcement but Prisma ORM doesn't natively integrate with RLS
- RLS only protects raw SQL queries, not Prisma queries without middleware
- Risk: Silent multi-tenancy failures if developer forgets tenant_id filter

**Decision Options:**

**OPTION A: Prisma Middleware Wrapper (RECOMMENDED)**
```typescript
// Implementation approach:
client.$use(async (params, next) => {
  // Auto-inject tenant_id into all queries
  if (params.model !== 'tenants') {
    if (params.args.where) {
      params.args.where.tenant_id = getCurrentTenantId();
    }
  }
  return next(params);
});
```
- **Pros:** Stays with Prisma, minimal code changes, middleware-based
- **Cons:** Still requires code review discipline
- **Effort:** 4 hours (implement + test + document)
- **Risk Level:** LOW

**OPTION B: Switch to Drizzle ORM**
- **Pros:** Better RLS integration, more control, lighter weight
- **Cons:** Rework 30% of data access layer, learning curve
- **Effort:** 2-3 weeks (refactor all queries)
- **Risk Level:** MEDIUM (large refactor)

**OPTION C: Abandon RLS, Rely on App-Layer Only**
- **Pros:** Simpler architecture, faster execution
- **Cons:** RLS becomes documentation, single point of failure
- **Effort:** 2 hours (documentation update)
- **Risk Level:** HIGH (security risk)

**Definition of Done:**
- [x] Team decision documented: Option A (Prisma Middleware)
- [x] Middleware implementation sketch created
- [x] Code pattern documented for team
- [x] Linting rules established to catch raw queries
- [x] Security assumptions updated in design doc

**Success Criteria:**
- ✅ Middleware automatically injects tenant_id on all non-global queries
- ✅ Unit tests verify middleware behavior
- ✅ Code review checklist includes "RLS middleware applied?" check

**Next Actions:**
1. Architect team votes: Option A confirmed
2. Draft middleware implementation
3. Create code review checklist item
4. Update design doc Section 5: "Data Model & Security"

---

### 1.2 Phase 1 Scope Redefinition

**Status:** 🔲 Not Started  
**Effort:** 6-8 hours  
**Owner:** Product + Engineering leads  
**Priority:** BLOCKING (prevents accurate sprint planning)

**Objective:**
Redefine Phase 1 from "Months 1-3" to realistic "Months 1-2" by moving multi-tenancy to Phase 1.5.

**Current State:**
- Phase 1 includes 3-4 months of work, labeled "Months 1-3"
- Includes multi-tenancy + RLS (should be Phase 1.5)
- Team morale will suffer when Phase 1 extends to Month 5

**Revised Scope:**

**PHASE 1: MVP (Weeks 1-8, 6-8 weeks actual)**
```
Week 1-2: Foundation
├─ [x] API scaffolding + auth middleware
├─ [x] Landing page (explain product)
├─ [x] Marketplace Fulfillment API integration

Week 2-4: Core Flows
├─ [x] Subscription lifecycle (create, activate, cancel)
├─ [x] Metering service (accept usage events)
├─ [x] Customer portal (dashboard + settings only)
└─ [x] Error handling + retry logic

Week 5-6: Testing & DevOps
├─ [x] Unit tests (80% coverage)
├─ [x] Integration tests (critical paths)
├─ [x] Docker containerization

Week 7-8: Deployment & Docs
├─ [x] Bicep IaC template (Container Apps)
├─ [x] API documentation (OpenAPI)
├─ [x] Quick-start guide
└─ [x] Team onboarding docs

NOT INCLUDED IN PHASE 1:
- ❌ Publisher portal (defer to Phase 1.5)
- ❌ Multi-tenancy/RLS (defer to Phase 1.5)
- ❌ GraphQL endpoint (defer to Phase 2)
- ❌ OpenTelemetry tracing (basic logging only)
- ❌ Multiple deployment options (Container Apps only)
- ❌ Advanced RBAC (basic roles in Phase 1.5)
```

**PHASE 1.5: Enhanced Features (Weeks 9-12, 4 weeks)**
```
├─ [x] Multi-tenant database + RLS integration
├─ [x] Publisher portal (basic)
├─ [x] Multi-tenancy security testing
├─ [x] Webhook management UI
└─ [x] Advanced RBAC foundation
```

**Definition of Done:**
- [x] Phase 1 checklist updated in design-document.md
- [x] Honest timeline: 6-8 weeks (not 12 weeks)
- [x] Multi-tenancy explicitly moved to Phase 1.5
- [x] Feature cut-lines documented
- [x] Team alignment achieved

**Success Criteria:**
- ✅ Phase 1 scope ≤ 6 weeks for team of 3
- ✅ Multi-tenancy deferred explicitly
- ✅ MVP delivers: subscriptions + metering + basic portal + Container Apps deployment
- ✅ All team members agree to scope

**Next Actions:**
1. Product lead proposes revised Phase 1 scope
2. Engineering lead estimates effort (6-8 weeks validation)
3. Team alignment meeting (1 hour)
4. Update design-document.md Phase Roadmap section
5. Create sprint planning template (8-week breakdown)

---

### 1.3 Technology Stack Binary Decisions

**Status:** 🔲 Not Started  
**Effort:** 2-3 hours  
**Owner:** Architecture team  
**Priority:** BLOCKING (prevents decision paralysis during implementation)

**Objective:**
Make binding technology choices for critical components, removing "optional" alternatives.

**Current State:**
- Design lists multiple options for Express/Fastify, Prisma/Drizzle, state management, etc.
- Team will waste 2-3 weeks debating instead of shipping
- Inconsistent patterns will emerge if multiple approaches used

**Final Decisions Required:**

**Decision 1: API Framework**
```
FINAL CHOICE: Express.js
├─ Rationale: Mature, stable, large ecosystem, team familiar
├─ Fallback: Fastify in Phase 2 if performance > 10k RPS needed
└─ NEVER use: Hono in Phase 1 (edge runtime adds complexity)
```

**Decision 2: ORM**
```
FINAL CHOICE: Prisma ORM (with middleware from Item 1.1)
├─ Rationale: Excellent DX, auto-migrations, type-safe
├─ RLS Integration: Via middleware wrapper (documented)
├─ NEVER use: Mix Prisma + Drizzle (inconsistent patterns)
└─ Phase 2: Evaluate Drizzle if RLS complexity grows
```

**Decision 3: Frontend State Management**
```
FINAL CHOICE: Zustand (global state only)
├─ Rationale: Lightweight, easy to reason about
├─ TanStack Query: For server state (separate concern)
├─ NEVER use: Jotai (atomic state unnecessary for this scope)
└─ Code review: Flag any imports of Jotai → reject
```

**Decision 4: Deployment Default**
```
FINAL CHOICE: Azure Container Apps
├─ Rationale: Serverless, good DX, reasonable cost, managed
├─ Fallback: App Service for migrations from .NET accelerator
├─ Phase 2: Kubernetes added for enterprise
├─ NEVER default to: Multiple options (Container Apps only in Phase 1)
```

**Decision 5: Metering Transport**
```
FINAL CHOICE: Azure Event Hubs
├─ Rationale: Managed Azure service, includes replay, reliable
├─ Alternative: Kafka only if Event Hubs insufficient (Phase 2+)
├─ NEVER use: RabbitMQ (operational overhead)
└─ Config: Single queue, 24-hour retention, auto-scaling
```

**Decision 6: Frontend CSS & Components**
```
FINAL CHOICE: Tailwind CSS + shadcn/ui
├─ Rationale: Modern, component library solid, consistent
├─ NEVER use: Custom CSS (consistency issues) or Ant Design
├─ Code review: Flag non-shadcn/ui components → require justification
└─ Design system: All components from shadcn/ui library
```

**Decision 7: Testing Framework**
```
FINAL CHOICE: Vitest (unit/integration) + Playwright (E2E)
├─ Rationale: Vitest faster than Jest, Playwright excellent for E2E
├─ NEVER use: Mix Jest + Mocha (inconsistency)
└─ Jest: Only for backward compatibility if needed
```

**Document Output: "Technology Stack Decision Log"**
```
File: docs/technology-decisions.md

Format:
- Component name
- Final choice
- Rationale (why this, why not alternatives)
- Trade-offs acknowledged
- Fallback/Phase 2 alternatives (if any)
- Code review guidance (what to look for)
- Links to implementation patterns
```

**Definition of Done:**
- [x] All 7 decisions documented in decision log
- [x] Rationale documented for each choice
- [x] Team consensus achieved
- [x] Code review checklist updated
- [x] ".eslintrc.js" rules enforce decisions (e.g., no Jotai imports)

**Success Criteria:**
- ✅ Decisions are FINAL (not "or" options)
- ✅ Every developer follows same technology choices
- ✅ Code review rejects deviations (e.g., "Why is Fastify used here?")
- ✅ No time wasted debating Express vs. Fastify during implementation

**Next Actions:**
1. Architecture team proposes final decision for each component
2. Team alignment vote (1 hour)
3. Document decisions in "Technology Stack Decision Log"
4. Update ESLint rules to enforce decisions
5. Communicate decisions to team (email + standup)

---

## 🔒 PRIORITY 2: Security & Operational Hardening (Week 2)

### 2.1 Metering Reliability Specification

**Status:** 🔲 Not Started  
**Effort:** 8-12 hours  
**Owner:** Backend lead  
**Priority:** HIGH (prevents billing data loss)

**Objective:**
Create comprehensive "Metering Service Operations Guide" with reliability SLAs, batch strategies, error recovery.

**Scope:**
- Batch size determination (100 events? 1000?)
- Submission frequency (hourly? 30-minute batches?)
- Marketplace API rate limiting handling
- **CRITICAL: Submission deadline SLA (within 4 hours of usage MINIMUM)**
- Failure recovery (DLQ strategy, replay procedures)
- Deduplication & idempotency key retention
- Observability per event (trace through entire pipeline)
- Alerting rules (metering submission failures)

**Deliverable: "Metering Service Operations Guide"**
```
Section 1: Submission Strategy
├─ Batch size: 100-1000 events (configurable)
├─ Submission frequency: Every 15 minutes OR when batch full
├─ Max time in queue: 30 minutes (force submission if timeout)
└─ Idempotency key retention: 30 days (prevent replays)

Section 2: Marketplace API Resilience
├─ Rate limits: Check docs (likely 100 req/min per subscription)
├─ Circuit breaker: After 5 consecutive 429, wait 5 minutes
├─ Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
├─ Retry budget: Maximum 10 retries per batch
└─ Recovery: DLQ after max retries exceeded

Section 3: CRITICAL: Submission Deadline SLA
├─ Guarantee: Usage submitted within 4 hours
├─ Billing cycle cutoff: Metering must submit BEFORE month end
├─ Validation: Alerts if submission older than 6 hours
└─ Escalation: Page on-call if submission fails for 1 hour

Section 4: Failure Scenarios & Recovery
├─ Scenario A: Marketplace API returns 500
│  ├─ Action: Retry with exponential backoff
│  ├─ DLQ: After max retries, move to dead-letter queue
│  ├─ Recovery: Manual replay via CLI command
│  └─ Alert: "Metering submission failed for X subscriptions"
│
├─ Scenario B: Batch partially rejected (50% success)
│  ├─ Action: Retry failed items individually
│  ├─ Logging: Log each failed item separately
│  ├─ Recovery: Operator reviews failed items, replays
│  └─ Alert: "Metering partial failure: X/Y items failed"
│
└─ Scenario C: Duplicate submission (network retry causes double-submit)
   ├─ Prevention: Idempotency key required on all submissions
   ├─ Validation: Marketplace deduplicates by key
   ├─ Logging: Track idempotency key → avoid duplicates
   └─ Alert: None (Marketplace handles deduplication)

Section 5: Observability
├─ Event-level tracing (trace ID through entire pipeline)
├─ Logs per event: Created, validated, batched, submitted, acknowledged
├─ Metrics: Events processed, submission rate, failure rate
└─ Dashboard: Metering health (real-time submission status)

Section 6: Alerting Rules
├─ Alert: Submission delay > 1 hour
├─ Alert: Failure rate > 5%
├─ Alert: DLQ depth > 100 items
├─ Alert: Idempotency key collision detected
└─ Escalation: Page on-call for submission delay > 6 hours
```

**Dependencies:**
- Item 1.1 (Prisma decision) - determines data access layer for metering
- Item 1.2 (Phase 1 scope) - metering is Phase 1 requirement

**Definition of Done:**
- [x] Operations guide document created and reviewed
- [x] Batch size, frequency, timeout parameters specified
- [x] Marketplace rate limiting strategy documented
- [x] **SLA: Usage submitted within 4 hours (CRITICAL)**
- [x] DLQ implementation strategy defined
- [x] Idempotency key retention policy documented
- [x] Observability architecture specified
- [x] Alerting rules defined with escalation procedures
- [x] Sample code for error handling provided
- [x] Failure scenario runbooks created

**Success Criteria:**
- ✅ Every metering failure scenario has documented recovery
- ✅ Developer can implement metering service from spec without ambiguity
- ✅ Operations team has runbook for metering failures
- ✅ Customer communication template provided for billing delays

**Next Actions:**
1. Backend lead drafts operations guide (4-6 hours)
2. Infrastructure lead reviews reliability aspects (1-2 hours)
3. Operations team reviews runbooks (1-2 hours)
4. Team alignment on SLAs (30 minutes)
5. Implement metering service based on spec

---

### 2.2 Tenant Isolation Security Hardening

**Status:** 🔲 Not Started  
**Effort:** 6-8 hours  
**Owner:** Security lead + Backend team  
**Priority:** HIGH (prevents cross-tenant data leakage)

**Objective:**
Comprehensive security specification for tenant isolation, covering webhooks, cache, audit logs, file storage.

**Scope:**
- Webhook signature verification + tenant ownership validation
- Cache key format with collision resistance
- Audit log access control
- File storage segregation strategy
- Threat model with specific attack scenarios

**Deliverable: "Security Hardening Specification"**

**Section 1: Webhook Payload Validation**
```typescript
// Validation checklist:
1. Verify webhook signature (HMAC-SHA256 against marketplace public key)
2. Verify webhook timestamp (within 5 minutes to prevent replay)
3. Extract subscription ID from webhook payload
4. LOAD subscription from database (verify tenant ownership)
5. COMPARE: Is webhook source tenant = subscription owner tenant?
   - If NO: Reject webhook, log security incident
6. FINALLY: Process webhook only if tenant ownership confirmed

// Code pattern:
async function handleMarketplaceWebhook(payload, signature) {
  // Step 1: Verify signature
  const isValid = verifySignature(payload, signature, publicKey);
  if (!isValid) throw new UnauthorizedError('Invalid signature');

  // Step 2: Verify timestamp (prevent replay)
  const timeDiff = Date.now() - payload.timestamp;
  if (timeDiff > 5 * 60 * 1000) throw new UnauthorizedError('Webhook expired');

  // Step 3: Load subscription + verify tenant
  const sub = await db.subscription.findUnique({
    where: { marketplaceSubscriptionId: payload.subscriptionId },
  });
  
  if (!sub) throw new NotFoundError('Subscription not found');
  
  // Step 4: Verify tenant ownership
  const requestTenantId = req.context.tenantId;
  if (sub.tenantId !== requestTenantId) {
    logger.error('SECURITY: Webhook tenant mismatch', {
      webhookTenantId: requestTenantId,
      subscriptionTenantId: sub.tenantId,
    });
    throw new ForbiddenError('Tenant mismatch');
  }

  // Step 5: Safe to process
  await processWebhookForSubscription(sub);
}
```

**Section 2: Cache Key Format & Collision Prevention**
```typescript
// ✅ SECURE cache key format:
const cacheKey = `cache:v1:${tenantId}:${resourceType}:${resourceId}:${contextHash}`;

// Example:
const key = `cache:v1:tenant_123:subscription:sub_456:${hash(context)}`;

// ❌ INSECURE (collision risk):
const badKey = `subscription:${subscriptionId}`;
// Problem: Two tenants with same UUID subscription ID share cache!

// Collision resistance validation:
function validateCacheKeyFormat(key) {
  const pattern = /^cache:v1:[^:]+:[^:]+:[^:]+:[^:]+$/;
  if (!pattern.test(key)) throw new Error('Invalid cache key format');
  
  // Extract tenant ID from key
  const parts = key.split(':');
  const tenantId = parts[2];
  
  // Verify tenant matches current context
  if (tenantId !== req.context.tenantId) {
    throw new Error('SECURITY: Cache tenant mismatch');
  }
}
```

**Section 3: Audit Log Access Control**
```
Audit log permissions matrix:

Role           Can Read Own Logs?  Can Read All Logs?  Can Export?
───────────────────────────────────────────────────────────────────
Super Admin    ✅ YES               ✅ YES              ✅ YES
Tenant Admin   ✅ YES (own tenant)  ❌ NO              ✅ YES
Owner          ✅ YES (own tenant)  ❌ NO              ✅ YES
Member         ❌ NO                ❌ NO              ❌ NO
Viewer         ❌ NO                ❌ NO              ❌ NO

Implementation:
- Super admin: No tenant filter, see all logs
- Tenant admin/Owner: Only logs where tenant_id = req.context.tenantId
- Member/Viewer: Access denied immediately
```

**Section 4: File Storage Segregation**
```
Strategy: Azure Blob Storage with role-based access

Architecture:
├─ Single storage account (shared)
├─ Single container: "tenant-files"
├─ Path structure: /tenant-files/{tenantId}/{resourceType}/{fileName}
│
├─ Example: /tenant-files/tenant_123/invoices/invoice_2026_05.pdf
│           /tenant-files/tenant_456/invoices/invoice_2026_05.pdf
│
└─ Access Control (Azure RBAC):
   - Each tenant gets Blob Data Contributor role
   - Limited to storage account (not specific path)
   - ❌ INSECURE (can read other tenant's files via path traversal)
   
BETTER: Managed Identity per tenant (infrastructure team decision)

Code enforcement:
- All file operations: Prefix path with tenantId
- Code review: Flag any blob operations without tenantId check
- Linting: ESLint rule to ensure tenantId in all blob operations
```

**Section 5: Threat Model**
```
Attack Scenario 1: Cross-Tenant Query
Attacker: Tenant A tries to query Tenant B's subscriptions
Defense 1: Authentication → Tenant B's token doesn't exist
Defense 2: Middleware → tenant_id injected from token
Defense 3: Database → RLS policy blocks query
Result: ✅ DEFENDED (defense in depth)

Attack Scenario 2: Cache Poisoning
Attacker: Tenant A modifies cache key to match Tenant B's cache
Defense 1: Cache key format includes tenantId
Defense 2: Cache retrieval validates tenantId matches context
Result: ✅ DEFENDED (format + validation)

Attack Scenario 3: Webhook Replay (different tenant)
Attacker: Intercepts Tenant A's webhook, replays to Tenant B endpoint
Defense 1: Webhook signature verification (tenant-specific key)
Defense 2: Tenant ownership check (payload must match webhook tenant)
Result: ✅ DEFENDED (signature + ownership check)

Attack Scenario 4: Audit Log Tampering
Attacker: Tenant admin modifies audit logs to cover tracks
Defense 1: Audit logs in immutable database table
Defense 2: Timestamps from server time (not client)
Defense 3: Audit trails reviewed by external audit (compliance)
Result: ✅ DEFENDED (immutability + external audit)

Attack Scenario 5: File Storage Misconfiguration
Attacker: Lists all blobs in storage account, reads other tenant's files
Defense 1: File paths segregated by tenantId
Defense 2: Storage account access via managed identity (scoped)
Defense 3: Code review: Check for hard-coded storage account access
Result: ⚠️  POTENTIALLY VULNERABLE (depends on RBAC config)
        → Mitigated by infrastructure team verification
```

**Definition of Done:**
- [x] Webhook validation code pattern documented
- [x] Cache key format specified with collision resistance proof
- [x] Audit log access control matrix created
- [x] File storage strategy defined
- [x] Threat model documented with 5+ attack scenarios
- [x] Security testing plan created (see Priority 5)
- [x] Code review checklist updated

**Success Criteria:**
- ✅ Webhook validation prevents cross-tenant submission
- ✅ Cache keys guarantee tenant isolation
- ✅ Audit logs only accessible by appropriate roles
- ✅ File operations always include tenantId
- ✅ Threat model accepted by security review

**Next Actions:**
1. Security lead drafts hardening spec (3-4 hours)
2. Backend lead reviews implementation patterns (1-2 hours)
3. Infrastructure lead reviews RBAC strategy (1 hour)
4. Security testing plan created (see Priority 5)
5. Code patterns added to project template

---

### 2.3 Production-Ready Checklist

**Status:** 🔲 Not Started  
**Effort:** 4-6 hours  
**Owner:** Engineering lead + QA lead  
**Priority:** HIGH (sets Phase 1 exit criteria)

**Objective:**
Define explicit, measurable "production-ready" criteria for Phase 1 completion.

**Deliverable: "Production Readiness Checklist"**
```
DEFINITION OF "PRODUCTION-READY" FOR PHASE 1:

MONITORING & OBSERVABILITY
├─ [x] 5+ monitoring dashboards created:
│  ├─ API Health (latency, error rate, RPS)
│  ├─ Subscription Lifecycle (creates, activations, cancellations)
│  ├─ Metering Submissions (batch success rate, latency)
│  ├─ Database Performance (query duration, connection pool)
│  └─ Error Tracking (error types, frequency, stack traces)
├─ [x] 15+ alert rules configured:
│  ├─ Error rate > 0.5% → Alert MEDIUM
│  ├─ Latency p99 > 500ms → Alert MEDIUM
│  ├─ API availability < 99.5% → Alert CRITICAL
│  ├─ Metering submission failure → Alert HIGH
│  ├─ Database connections > 80% → Alert MEDIUM
│  └─ Other: 10+ additional alerts per infrastructure
├─ [x] Tracing enabled (basic logging, not OpenTelemetry yet)
├─ [x] Structured logging (Pino with tenant_id always included)
└─ [x] Log retention policy (logs retained 30 days)

TESTING & QUALITY
├─ [x] Unit tests: ≥ 80% code coverage
├─ [x] Integration tests: All critical paths (subscription, metering, webhooks)
├─ [x] E2E tests: Core user workflows (subscribe → dashboard → metering)
├─ [x] Security tests: Tenant isolation (cross-tenant access rejected)
├─ [x] Load test: Sustained 100 RPS (10x expected peak traffic)
├─ [x] All tests passing (>95% pass rate, flaky tests identified)
└─ [x] Code review standard: Minimum 2 reviewers, 0 critical issues

OPERATIONAL READINESS
├─ [x] Runbooks created for common failures:
│  ├─ "How to respond to metering submission failure"
│  ├─ "How to debug subscription activation failure"
│  ├─ "How to investigate cross-tenant data access claim"
│  ├─ "How to scale database connections"
│  └─ "How to rollback if error rate > 1%"
├─ [x] On-call rotation established (5+ engineers on rotation)
├─ [x] Incident communication plan (customer notification template)
├─ [x] Deployment procedure documented (terraform apply steps)
├─ [x] Rollback procedure documented (manual steps, automated checks)
└─ [x] Backup & recovery procedure (tested weekly)

SECURITY & COMPLIANCE
├─ [x] Authentication working (Entra ID OAuth)
├─ [x] Authorization enforced (RBAC roles + feature checks)
├─ [x] Tenant isolation validated (security testing passed)
├─ [x] Secrets management (Key Vault configured)
├─ [x] Encryption at rest (TDE enabled on database)
├─ [x] Encryption in transit (TLS 1.3 enforced)
├─ [x] Security review completed (no critical/high vulnerabilities)
├─ [x] Penetration testing: Basic tenant isolation scenarios
└─ [x] Compliance checklist (if applicable: SOC2, GDPR)

MARKETPLACE INTEGRATION
├─ [x] Fulfillment API: Activate subscriptions (tested with sandbox)
├─ [x] Metering API: Submit usage (tested with sandbox)
├─ [x] Webhook handling: All event types (tested locally + staging)
├─ [x] Error handling: Rate limits, timeouts, auth failures
└─ [x] Marketplace API error recovery tested (circuit breaker works)

DOCUMENTATION
├─ [x] API documentation (OpenAPI spec, Swagger UI)
├─ [x] Quick-start guide (5-minute deployment)
├─ [x] Architecture diagram (system design)
├─ [x] Data model documentation (database schema)
├─ [x] Runbooks (operations guides)
├─ [x] Troubleshooting guide (common issues + solutions)
└─ [x] Developer setup guide (local dev in 15 minutes)

NOT INCLUDED IN "PRODUCTION-READY":
❌ Kubernetes deployment (Phase 2)
❌ Multi-region failover (Phase 2)
❌ Advanced RBAC (Phase 1.5)
❌ GraphQL endpoint (Phase 2)
❌ OpenTelemetry tracing (Phase 2 - basic logging in Phase 1)
❌ Webhook management UI (Phase 1.5)
❌ Multi-tenancy full isolation (Phase 1.5)

MEASUREMENT:
✅ = DONE (test/verification evidence required)
⏳ = IN PROGRESS (ETA documented)
🚫 = BLOCKED (reason documented)

APPROVAL:
- [x] Engineering lead approval: All 🟢 GREEN
- [x] Product lead approval: Phase 1 acceptance
- [x] Operations lead approval: Runbooks adequate
- [x] Security lead approval: No critical/high vulnerabilities
```

**Definition of Done:**
- [x] Checklist created with all criteria specified
- [x] Measurable success criteria for each item
- [x] Integrated into project management (Jira/Azure DevOps)
- [x] Sign-off process defined (4-way approval)
- [x] Tied to Phase 1 scope reduction (Item 1.2)

**Success Criteria:**
- ✅ Production-ready is objectively measurable
- ✅ Team knows when Phase 1 is complete
- ✅ No surprises on what "production" means
- ✅ Checklist used as exit criteria for Phase 1

**Next Actions:**
1. Engineering lead drafts checklist
2. QA lead reviews and refines
3. Operations lead reviews runbooks
4. Integrate into project management system
5. Present to team for final agreement

---

## 📋 PRIORITY 3: Documentation & Operations (Week 3)

### 3.1 Migration Operations Guide

**Status:** 🔲 Not Started  
**Effort:** 12-16 hours  
**Owner:** Infrastructure + Backend leads  
**Priority:** MEDIUM-HIGH (enables smooth migration for existing .NET accelerator users)

**Objective:**
Create comprehensive runbooks for migrating customers from original .NET accelerator to FastSaaS.

**Scope:**
- Dual-write implementation procedure
- Cutover procedure with timings
- Rollback decision tree
- Data transformation + validation
- Communication templates

**Deliverable: "Migration Operations Guide"**
```
Part 1: Dual-Write Strategy

Phase A: Dual-Write Preparation
├─ Week 1: Enable dual-write feature flag
│  ├─ For endpoint: POST /subscriptions
│  ├─ Old system: Write to SQL Server
│  ├─ New system: Write to PostgreSQL (via dual-write handler)
│  ├─ Logging: Track all writes to both systems
│  └─ Monitoring: Error rate, divergence rate
│
├─ Week 2: Test subset of customers
│  ├─ Select 10% of customer base
│  ├─ Monitor: Divergence between old and new writes
│  ├─ Validation: Checksums match for old vs. new
│  └─ Rollback: Quick disable if divergence > 1%
│
└─ Week 3: Full customer base on dual-write
   ├─ All subscriptions written to both systems
   ├─ Validation: Daily divergence checks
   └─ Monitoring: Alert if divergence > 0.5%

Phase B: Validation
├─ Nightly reconciliation: Compare record counts
│  ├─ Old system: SELECT COUNT(*) FROM Subscriptions
│  ├─ New system: SELECT COUNT(*) FROM subscriptions
│  ├─ Alert: If difference > 1 record
│  └─ Log: Divergence report each night
│
├─ Weekly spot-check: Sample 100 random subscriptions
│  ├─ Compare data: Verify all fields match
│  ├─ Alert: If any mismatches found
│  └─ Action: Investigate and reconcile
│
└─ Monthly deep validation: Checksums on all data
   ├─ Old system: Generate checksum for all subscriptions
   ├─ New system: Generate checksum for all subscriptions
   ├─ Compare: MD5 checksums must match
   └─ Alert: If checksums diverge → STOP migration

Part 2: Cutover Procedure

Step 1: Pre-Cutover (1 week before)
├─ [x] Final data validation (checksums match)
├─ [x] Backup old system (test restore)
├─ [x] Customer notification (email: "Maintenance window Sat 2 AM")
├─ [x] Support team alert (on-call ready)
├─ [x] Monitoring dashboard open (real-time metrics)
└─ [x] Rollback plan reviewed (4 engineers agree)

Step 2: Cutover Window (Saturday 2 AM UTC, 1-hour window)
├─ T+00:00: Disable dual-write
├─ T+00:00: Start read-only mode on old system
├─ T+00:05: Run final data validation (checksum comparison)
│  └─ If mismatch: ABORT, rollback, notify customers
├─ T+00:10: Switch API routing to new system
│  ├─ Old: POST /subscriptions → OLD system
│  └─ New: POST /subscriptions → NEW system (Prisma)
├─ T+00:15: Monitor error rate on new system
│  └─ Alert threshold: > 1% = immediate rollback
├─ T+00:30: Verify 100 customer logins successful
├─ T+00:45: Test 5 critical workflows:
│  ├─ [ ] Create subscription
│  ├─ [ ] Submit metering
│  ├─ [ ] Activate subscription
│  ├─ [ ] View customer dashboard
│  └─ [ ] Process webhook
├─ T+00:50: If all 5 workflows OK: Migration complete ✅
│  └─ Announce: "Migration successful, new system live"
├─ T+00:50-T+01:00: Continue monitoring
│  ├─ Alert threshold: > 0.5% error rate
│  ├─ Alert threshold: Metering submissions failing
│  ├─ Alert threshold: > 100ms latency increase
│  └─ If ANY alert: Prepare rollback
└─ T+01:00: If no alerts: Cutover complete, return to business hours

Step 3: Rollback Triggers
├─ Error rate > 1% for 5+ minutes → IMMEDIATE ROLLBACK
├─ Error rate > 0.5% for 15+ minutes → IMMEDIATE ROLLBACK
├─ Metering submission failure rate > 10% → IMMEDIATE ROLLBACK
├─ Failed logins > 100/hour → IMMEDIATE ROLLBACK
├─ Latency p95 > 1 second → 15-min observation, then rollback if sustained
└─ Manual trigger: On-call engineer judgment (no data loss? Rollback anyway to safe state)

Rollback Procedure (< 5 minutes):
1. Switch API routing: NEW system → OLD system
2. Disable new system (stop all processes)
3. Validate old system responding correctly
4. Customer communication: "Maintenance extended, investigating"
5. Post-incident: Analyze what went wrong, don't retry for 24 hours

Part 3: Data Validation Scripts

Script 1: Pre-Cutover Validation
```python
def validate_pre_cutover():
    old_count = query_old_system("SELECT COUNT(*) FROM Subscriptions")
    new_count = query_new_system("SELECT COUNT(*) FROM subscriptions")
    
    if old_count != new_count:
        alert_critical(f"Record count mismatch: {old_count} vs {new_count}")
        return False
    
    # Checksum validation
    old_checksum = generate_checksum(old_system)
    new_checksum = generate_checksum(new_system)
    
    if old_checksum != new_checksum:
        alert_critical(f"Checksum mismatch: {old_checksum} vs {new_checksum}")
        return False
    
    log_success("Pre-cutover validation PASSED")
    return True
```

Script 2: Post-Cutover Spot-Check
```python
def post_cutover_validation():
    sample = get_random_subscriptions(count=100)
    
    for sub_id in sample:
        old_data = query_old_system(f"SELECT * FROM Subscriptions WHERE ID = {sub_id}")
        new_data = query_new_system(f"SELECT * FROM subscriptions WHERE id = {sub_id}")
        
        if old_data != new_data:
            alert_critical(f"Data mismatch for subscription {sub_id}")
            return False
    
    log_success("Post-cutover spot-check PASSED")
    return True
```

Part 4: Communication Templates

Template 1: Pre-Migration Notification (1 week before)
```
Subject: Upcoming Platform Migration - Maintenance Window

Dear Customers,

We're excited to announce that FastSaaS will undergo a planned migration
on Saturday, May 25th, 2 AM UTC.

What's happening: We're migrating to a modernized platform for improved
performance and reliability.

Impact: Your subscriptions and metering will continue uninterrupted. 
Expected downtime: < 15 minutes.

Questions? Contact support@fastsaas.dev

— FastSaaS Team
```

Template 2: Post-Cutover Announcement (successful)
```
Subject: Platform Migration Complete ✅

Dear Customers,

Great news! FastSaaS migration completed successfully on Saturday, May 25th, 2:15 AM UTC.

New capabilities:
- Improved API performance (average latency down 30%)
- Better reliability (99.95% uptime SLA)
- Enhanced monitoring and support

Your data is secure and intact. All subscriptions, metering, and settings
have been successfully migrated.

Questions? Contact support@fastsaas.dev

— FastSaaS Team
```

Template 3: Post-Cutover Rollback (if needed)
```
Subject: Platform Migration Rescheduled

Dear Customers,

During our scheduled maintenance window, we encountered a data integrity check
that triggered our safety protocols. To protect your data, we rolled back to
the previous system.

What does this mean for you?
- Your subscriptions and data are secure
- Service resumed immediately after rollback
- No customer action required

We will reschedule the migration for [DATE] after thorough investigation.

We apologize for the inconvenience. Questions? Contact support@fastsaas.dev

— FastSaaS Team
```

Part 5: Operational Runbooks

Runbook 1: "How to Respond if Error Rate Spikes During Cutover"
├─ Observation: Error rate > 1%
├─ Immediate: Alert ops team (Slack notification)
├─ Step 1: Check error type (authentication? database? metering?)
├─ Step 2: If database → check connection pool health
├─ Step 3: If new system overloaded → trigger horizontal scale
├─ Decision point (after 5 minutes): Errors still > 1%?
│  ├─ YES: ABORT MIGRATION, rollback to old system
│  └─ NO: Continue monitoring, increase alert frequency
└─ Post-incident: Root cause analysis (why did error rate spike?)

Runbook 2: "How to Respond if Metering Submissions Fail"
├─ Observation: Metering submission failure rate > 10%
├─ Immediate: Alert on-call engineer
├─ Step 1: Check Marketplace API status (is it down?)
├─ Step 2: If Marketplace is up → check connection string
├─ Step 3: Verify authentication credentials are correct
├─ Step 4: Manual test: POST 1 usage event via curl
├─ Decision: Is metering working correctly?
│  ├─ YES: False alarm, check alert thresholds
│  └─ NO: ABORT MIGRATION, rollback immediately
└─ Post-incident: Why weren't we catching this in staging?

Runbook 3: "How to Rollback if Cutover Fails"
├─ Step 1: Alert executive (CEO/CTO call)
├─ Step 2: Disable new system (stop all FastSaaS processes)
├─ Step 3: Switch API load balancer: NEW → OLD
├─ Step 4: Verify old system responding (test 5 API calls)
├─ Step 5: Send customer notification (use Template 3)
├─ Step 6: Gather logs from cutover (forensics)
├─ Step 7: Schedule post-incident review
└─ Step 8: Update runbooks based on findings
```

**Definition of Done:**
- [x] Dual-write implementation procedure documented
- [x] Cutover procedure with step-by-step timing
- [x] Rollback decision tree specified
- [x] Data validation scripts created + tested
- [x] Communication templates drafted
- [x] Operational runbooks for failure scenarios
- [x] Team dry-run of cutover procedure (2-3 hours before live)

**Success Criteria:**
- ✅ Cutover completed within 1-hour window
- ✅ Zero customer data loss
- ✅ Rollback < 5 minutes if needed
- ✅ Post-cutover validation shows checksums match

**Next Actions:**
1. Infrastructure lead drafts dual-write strategy
2. Backend lead creates validation scripts
3. Operations lead drafts runbooks
4. Team dry-run on staging environment (1 week before live)
5. Final review + approval from engineering + product

---

### 3.2 Add Design Document Sections

**Status:** 🔲 Not Started  
**Effort:** 8-10 hours  
**Owner:** Technical writer + Architecture team  
**Priority:** MEDIUM (sets expectations, reduces surprises)

**Objective:**
Add three new sections to design-document.md documenting limitations, risks, and failure modes.

**Section A: "Limitations & Trade-Offs"**
```markdown
# Limitations & Trade-Offs

This section documents architectural constraints and why we made certain choices
despite trade-offs.

## PostgreSQL RLS + Prisma ORM Impedance

### What We Chose:
- Shared database with Row-Level Security policies
- Prisma ORM for data access with middleware wrapper

### The Trade-Off:
- RLS is defense-in-depth, not primary enforcement
- Requires middleware to inject tenant_id automatically
- Developer must use type-safe Prisma API (not raw SQL)
- Alternative (Drizzle ORM) requires full rewrite in Phase 2+

### Why This Choice:
- Shared database = lowest cost (single database for all tenants)
- Prisma = best DX (type-safe, migrations, auto-generated types)
- Middleware approach = minimal code changes, acceptable security

### Mitigations:
- ✅ Middleware automatically injects tenant_id
- ✅ Linting rules prevent raw SQL
- ✅ Code review checklist includes RLS validation
- ✅ Security testing validates isolation

### If This Becomes a Problem:
- Drizzle ORM migration (Phase 2) for tighter RLS integration
- Isolated databases per tenant (Phase 2) for maximum isolation

---

## Container Apps Pricing Opacity

### What We Chose:
- Azure Container Apps (serverless, per-second billing)

### The Trade-Off:
- Per-second billing hard to forecast
- Price varies by vCPU, memory, region
- Difficult to estimate costs before deployment

### Why This Choice:
- Best DX (no server management, auto-scaling)
- Reasonable costs for small to medium workloads
- Free tier available for pilots

### Mitigations:
- ✅ Cost monitoring dashboard (check daily)
- ✅ Monthly budget reviews with finance
- ✅ Auto-scale limits set (max replicas = 10)
- ✅ Fallback: App Service if costs exceed $X/month

### If This Becomes a Problem:
- Switch to App Service (fixed pricing, less flexible)
- Evaluate Kubernetes (predictable costs, higher ops overhead)

---

## Multi-Tenancy Isolation Trade-Offs

### What We Chose:
- Shared database with row-level security
- NOT isolated databases per tenant

### Trade-Offs:
- ✅ PROS: Lowest cost, easiest to operate, single backup strategy
- ❌ CONS: Higher security complexity, RLS configuration mistakes catastrophic

### Why This Choice:
- Cost efficiency (single database cheaper than per-tenant)
- Operational simplicity (fewer databases to patch)
- Suitable for Phase 1 MVP

### If This Becomes a Problem:
- Phase 1.5: Isolated database option available
- Migration: Move enterprise customers to isolated database
- Cost: Multi-tenancy support costs offset by customer tier

---

## GraphQL Support (Future)

### What We Chose:
- REST API in Phase 1
- GraphQL as optional Phase 2 feature

### Trade-Offs:
- ✅ PROS: Simpler Phase 1 implementation, REST widely understood
- ❌ CONS: REST requires N+1 query workarounds, GraphQL would help

### Why This Choice:
- REST is sufficient for Phase 1 use cases
- GraphQL adds complexity not needed for MVP
- Developers can use batch endpoints instead

### If This Becomes a Problem:
- Phase 2: Add GraphQL endpoint alongside REST
- Migration: Gradual, clients can use REST or GraphQL
```

**Section B: "Known Risks"**
```markdown
# Known Risks & Mitigation Strategies

This section documents identified risks and our mitigation plans.

## HIGH SEVERITY RISKS

### Risk: Metering Data Consistency

**Description:** If metering batch submission fails, customers may not be billed correctly.

**Probability:** MEDIUM (Marketplace API occasionally fails)  
**Impact:** HIGH (revenue recognition affected)  
**Exposure:** 1 hour of missed metering = $10K+ lost revenue

**Mitigation:**
1. ✅ Metering operations guide specifies retry strategy + SLA (4 hours)
2. ✅ Alerts: Submission failure rate > 5% triggers immediate alert
3. ✅ Dead-letter queue: Failed submissions logged for manual replay
4. ✅ Validation: Daily reconciliation of submitted vs. revenue recognized
5. ✅ Runbook: How to replay failed metering events

**Monitoring:**
```
Dashboard: Metering Health
├─ Events submitted per hour
├─ Submission failure rate (alert > 5%)
├─ DLQ depth (alert > 100)
└─ Revenue recognized vs. usage collected (daily reconciliation)
```

**Responsible Party:** Backend lead (owns metering service reliability)

---

### Risk: Tenant Isolation Breach (Cross-Tenant Data Access)

**Description:** Bug in tenant context middleware or RLS policy allows Tenant A to access Tenant B's data.

**Probability:** LOW-MEDIUM (well-tested, but code review burden)  
**Impact:** CRITICAL (compliance violation, customer breach)  
**Exposure:** All customer data at risk if misconfigured

**Mitigation:**
1. ✅ Security testing: 20+ test cases validating isolation
2. ✅ Code review: Mandatory tenant_id validation checklist
3. ✅ Linting: ESLint rules prevent raw queries bypassing middleware
4. ✅ Monitoring: Alerts on suspicious cross-tenant access patterns
5. ✅ Database: RLS policies act as final defense

**Monitoring:**
```
Alerts:
├─ Query returns data from > 1 tenant (impossible, fire CRITICAL alert)
├─ Tenant context extraction failure (alert HIGH)
└─ RLS policy execution error (alert CRITICAL)

Audit Log:
├─ Every data access logged with tenant_id
├─ Monthly audit: Verify no cross-tenant access in logs
└─ Anomaly detection: Flag unusual access patterns
```

**Responsible Party:** Security lead + backend team

---

### Risk: Marketplace API Downtime

**Description:** Microsoft Commercial Marketplace Fulfillment API becomes unavailable.

**Probability:** LOW (99.95% uptime SLA)  
**Impact:** HIGH (customers can't activate subscriptions)  
**Exposure:** Every minute of Marketplace downtime = X subscription activations blocked

**Mitigation:**
1. ✅ Circuit breaker: Stop retrying after 5 failures, wait 5 minutes
2. ✅ Graceful degradation: Show customer "Marketplace temporarily unavailable, retry later"
3. ✅ Queue: Store activation requests locally, replay when Marketplace recovers
4. ✅ Monitoring: Alert if Marketplace latency > 5 seconds
5. ✅ Runbook: Escalate to Microsoft support if downtime > 15 minutes

**Monitoring:**
```
Alerts:
├─ Marketplace API latency > 5 seconds (alert MEDIUM)
├─ Marketplace API failure rate > 1% (alert HIGH)
├─ Circuit breaker activated (alert MEDIUM)
└─ Activation queue depth > 100 (alert MEDIUM)

Dashboard:
├─ Marketplace API health (green/yellow/red)
├─ Activation queue depth (should be near 0)
└─ Activation latency (should be < 2 seconds normally)
```

**Responsible Party:** Infrastructure + Backend leads

---

### Risk: Database Migration Data Loss

**Description:** Dual-write procedure diverges, cutover loses data.

**Probability:** MEDIUM (complex multi-system coordination)  
**Impact:** CRITICAL (customer subscriptions lost)  
**Exposure:** All customer data if validation skipped

**Mitigation:**
1. ✅ Validation: Checksums must match pre-cutover (automatic check)
2. ✅ Dry-run: Practice migration on staging environment
3. ✅ Rollback plan: Revert to old system if divergence > 1 record
4. ✅ Monitoring: Real-time divergence detection during dual-write
5. ✅ Runbook: Step-by-step cutover procedure with verification

**Monitoring:**
```
Pre-Cutover:
├─ Nightly reconciliation (record count must match)
├─ Weekly spot-check (100 random records validated)
└─ Monthly checksum validation (entire dataset)

Cutover Window:
├─ Real-time error rate monitoring (alert > 1%)
├─ Real-time metering validation
└─ Post-cutover: 100% verification of critical workflows
```

**Responsible Party:** Infrastructure lead + DBA

---

## MEDIUM SEVERITY RISKS

### Risk: Webhook Replay / Duplicate Charges

**Description:** Webhook processed twice due to retry logic, customer charged twice.

**Probability:** MEDIUM (network retries common)  
**Impact:** MEDIUM (customer refund + support burden)  
**Exposure:** Per webhook = customer charged twice

**Mitigation:**
1. ✅ Idempotency key: Every webhook has unique ID (deduplication)
2. ✅ Database: Idempotency key index prevents duplicate processing
3. ✅ Validation: Check for duplicate webhook IDs before processing
4. ✅ Runbook: If duplicate found, log and skip without charging

---

### Risk: Cache Invalidation Failures

**Description:** Distributed cache serves stale data across multiple replicas.

**Probability:** LOW-MEDIUM (cache expiration edge cases)  
**Impact:** MEDIUM (incorrect subscription data shown to customer)  
**Exposure:** Customer sees outdated plan information or seat count

**Mitigation:**
1. ✅ Cache TTL: 5 minutes (acceptable staleness)
2. ✅ Invalidation: Explicit cache.delete() on mutations
3. ✅ Validation: Before billing, fetch fresh from database
4. ✅ Monitoring: Cache hit ratio dashboard (alert if < 40%)

---

### Risk: Regional Latency (Multi-Region Users)

**Description:** Non-US customers see > 100ms latency.

**Probability:** HIGH (geography unavoidable)  
**Impact:** LOW (annoying but not breaking)  
**Exposure:** Poor UX in non-primary regions

**Mitigation:**
1. ✅ Phase 2: Multi-region deployment with regional endpoints
2. ✅ Phase 1: Monitor latency by region, plan expansion
3. ✅ CDN: Serve static assets from CDN (latency reduced)

---

## LOW SEVERITY RISKS

### Risk: SDK Adoption Slow

**Description:** Developers prefer direct API calls over TypeScript SDK.

**Probability:** MEDIUM (SDKs take time to adopt)  
**Impact:** LOW (docs + API are sufficient, SDK is nice-to-have)  
**Exposure:** SDK maintenance burden lower than expected

**Mitigation:**
1. ✅ Phase 3: Publish SDK on NPM with good documentation
2. ✅ Examples: Provide integration examples (Stripe, etc.)
3. ✅ Support: Answer SDK questions quickly

---

### Risk: Portal UI/UX Issues

**Description:** Customer portal confusing or slow.

**Probability:** MEDIUM (UX is subjective)  
**Impact:** LOW (API-first, portal is supporting tool)  
**Exposure:** Customer support escalations about UI

**Mitigation:**
1. ✅ Phase 1.5: Collect customer feedback, iterate
2. ✅ User testing: Before Phase 1 release, test with 5 customers
3. ✅ Analytics: Track portal usage patterns, identify pain points

---

## RISK SUMMARY TABLE

| Risk | Severity | Probability | Mitigation | Owner | Status |
|------|----------|-------------|-----------|-------|--------|
| Metering inconsistency | HIGH | MEDIUM | SLA + alerts + DLQ | Backend | 🟢 Planned |
| Tenant isolation breach | CRITICAL | LOW | Security tests + code review | Security | 🟢 Planned |
| Marketplace downtime | HIGH | LOW | Circuit breaker + queue | Infra | 🟢 Planned |
| Migration data loss | CRITICAL | MEDIUM | Validation + dry-run | DBA | 🟢 Planned |
| Webhook duplication | MEDIUM | MEDIUM | Idempotency key | Backend | 🟢 Planned |
| Cache staleness | MEDIUM | LOW | TTL + invalidation | Backend | 🟢 Planned |
| Regional latency | MEDIUM | HIGH | Phase 2 multi-region | Infra | 🟡 Phase 2 |
| SDK adoption | LOW | MEDIUM | Good docs + examples | Dev Rel | 🟢 Phase 3 |
| Portal UX | LOW | MEDIUM | User testing + feedback | Product | 🟢 Phase 1.5 |
```

**Section C: "Failure Modes & Recovery"**
```markdown
# Failure Modes & Recovery Procedures

This section documents specific failure scenarios and how to recover.

## Failure Mode 1: Metering Batch Submission Fails

**Scenario:** Customer uses 1000 units. Usage event submitted to metering service.
After 10 retries, Marketplace API still returning 503. Event goes to DLQ.

**Detection:**
- Alert fires: "Metering submission failed for subscription X"
- Monitoring dashboard shows: DLQ depth = 5,000 events

**Recovery Procedure (30 minutes):**
1. Check Marketplace status page (is Azure status page showing issues?)
   - If YES: Wait for Marketplace recovery, don't manually intervene
   - If NO: Investigate our connection (proceed to step 2)

2. Check our Marketplace API credentials
   - Command: `check-marketplace-credentials`
   - If INVALID: Rotate credentials, retry batch

3. Check database: Are events properly stored?
   - Query: `SELECT COUNT(*) FROM usage_events WHERE status = 'pending'`
   - If < expected count: Data loss, escalate to DBA

4. If Marketplace is back online, manually retry:
   - Command: `retry-metering-batch --subscriptionId X --since 1h`
   - Monitor: Wait for batch to complete
   - Validate: Check Marketplace received events

5. If still failing, escalate:
   - Escalate to on-call engineer
   - Page Marketplace support (have ticket number ready)

**Prevention:**
- Alert threshold: Failures > 5% → page on-call (don't wait 30 min)
- Circuit breaker: Stop retrying after 5 failures, wait 5 min before retry

**Post-Recovery:**
- Check for duplicate submissions (idempotency key)
- Reconcile customer billing (may need manual adjustment)
- Update Marketplace calendar (log this incident)
- Root cause analysis (why did Marketplace fail?)

---

## Failure Mode 2: Tenant Context Middleware Failure

**Scenario:** Middleware crashes due to bug. Every API request now fails with 500 error.

**Detection:**
- Alert fires: "API error rate > 1%"
- Monitoring: All endpoints returning 500
- Error log: "Error: Cannot read property 'tenantId' of undefined"

**Recovery Procedure (5 minutes):**
1. Immediate: Rollback to previous version
   - Command: `kubectl rollout undo deployment/fastsaas-api`
   - Wait: 30 seconds for pods to restart
   - Verify: Test API call, should return 200

2. Post-rollback diagnostics (do this AFTER service restored):
   - Check: What code changed in recent deployment?
   - Identify: Null pointer dereference in middleware?
   - Fix: Add null check + unit test
   - Re-deploy: After testing in staging

3. Post-incident:
   - Root cause: Why didn't tests catch this?
   - Update: Add more defensive middleware tests
   - Process: Require middleware tests for every change

**Prevention:**
- Code review: Middleware changes require 2+ reviewers
- Testing: 100% test coverage for tenant context extraction
- Linting: TypeScript strict mode (no implicit any)

---

## Failure Mode 3: Database Connection Pool Exhausted

**Scenario:** API load increases 10x. Connection pool (max 20) exhausted.
New API requests hang, waiting for connections.

**Detection:**
- Alert fires: "Database connections > 80%"
- Monitoring: API latency increases (p95 > 500ms)
- Database log: "too many connections"

**Recovery Procedure (10 minutes):**
1. Immediate: Increase connection pool size
   - Edit: DATABASE_POOL_SIZE = 50
   - Restart: API pods
   - Wait: Connections rebalance

2. Monitor: Did increasing pool fix the issue?
   - If YES: Investigate root cause (step 3)
   - If NO: Scale horizontally (add more API replicas)

3. Scale horizontally if needed:
   - Command: `kubectl scale deployment fastsaas-api --replicas 5`
   - Wait: New pods come online
   - Verify: API latency returns to normal (< 200ms)

4. Root cause analysis:
   - Query: "What changed that caused 10x load?"
   - Check: Did new feature cause increased database access?
   - Optimize: Add database index or cache layer
   - Prevent: Pre-load test with expected peak traffic

**Prevention:**
- Load testing: Simulate 10x peak traffic quarterly
- Monitoring: Alert at 60% connection usage (before exhaustion)
- Scaling: Auto-scale database replicas when CPU > 70%

---

## Failure Mode 4: Webhook from Marketplace Not Processed

**Scenario:** Customer changes plan. Marketplace sends ChangeQuantity webhook.
Webhook processed but subscription not updated (webhook handler crashed).

**Detection:**
- Customer complaint: "I upgraded to Pro but still see Basic features"
- Support team: "Subscription status shows 'PendingFulfillment', should be 'Subscribed'"
- Webhook logs: "Error processing ChangeQuantity webhook"

**Recovery Procedure (30 minutes):**
1. Verify webhook was received:
   - Query: `SELECT * FROM webhooks WHERE type = 'ChangeQuantity' AND status = 'Failed'`
   - If record exists: Webhook was received but failed to process

2. Diagnose failure:
   - Check: Webhook handler error message
   - Common causes: Subscription not found, subscription_id mismatch
   - Fix: Update subscription_id mapping if needed

3. Retry webhook:
   - Command: `retry-webhook --webhookId X`
   - Monitor: Check subscription status updated
   - Verify: Customer can see new plan features

4. Notify customer:
   - Message: "Your plan upgrade completed, you should see changes now"
   - If still broken: Investigate further, manually update subscription

5. Root cause:
   - Why didn't webhook handler handle this case?
   - Add error handling for missing subscriptions
   - Test all webhook types with edge cases

**Prevention:**
- Webhook retry logic: Auto-retry after 1, 5, 15 minutes
- Monitoring: Alert if failed webhook not retried after 1 hour
- Testing: E2E tests for all webhook types

---

## Failure Mode 5: Cross-Tenant Data Leak (Security)

**Scenario:** Developer removes tenant_id filter by accident. Tenant A can now query Tenant B's subscriptions.

**Detection:**
- Security alert: "Query returned data from multiple tenants"
- Audit log: "User from Tenant A accessed Tenant B subscription"
- Customer complaint: "I can see other companies' data in my dashboard"

**Recovery Procedure (IMMEDIATE):**
1. IMMEDIATE: Take API offline if widespread
   - Command: `kubectl scale deployment fastsaas-api --replicas 0`
   - Notify: Customers (incident communication)

2. Diagnose scope:
   - Query: "How many cross-tenant accesses occurred?"
   - Query: "How many tenants were affected?"
   - Query: "How much data was leaked?"

3. Contain:
   - Identify: Which code change caused this?
   - Revert: Roll back to previous version immediately
   - Fix: Add tenant_id filter back, add test to prevent regression

4. Assess damage:
   - Data accessed: Customer details, subscription info, usage, metering
   - Duration: When did leak start? How long was it exposed?
   - Affected customers: How many? Can we notify them?

5. Notify customers (within 24 hours, per GDPR):
   - Transparency: "We detected a data leak, fixed it, customers may have been affected"
   - Remediation: "We're offering 1 month free service as compensation"
   - Prevention: "Here's what we changed to prevent this in future"

6. Post-incident:
   - Root cause: Why didn't code review catch this?
   - Linting: Add rule: "tenant_id must be in every query WHERE clause"
   - Testing: Add test: "Tenant A cannot access Tenant B data"
   - Process: Require security review for all data access changes

**Prevention:**
- Code review: Mandatory tenant_id validation checklist
- Testing: Security tests for tenant isolation (automated)
- Linting: ESLint rules prevent unfiltered queries
- Monitoring: Continuous monitoring for cross-tenant access patterns

---

## Recovery Runbook Quick Reference

| Failure Mode | Detection | Time to Recovery | Owner |
|---|---|---|---|
| Metering submission fails | Error rate alert | 30 min | Backend |
| Middleware crash | API error rate spike | 5 min | Backend |
| Connection pool exhausted | Latency alert | 10 min | DBA |
| Webhook not processed | Customer complaint | 30 min | Backend |
| Cross-tenant data leak | Security alert | 5 min | Security |
| Marketplace downtime | Circuit breaker triggered | N/A (wait) | Infra |
| Migration data divergence | Checksum mismatch | 30 min | DBA |
```

**Definition of Done:**
- [x] Three sections added to design-document.md
- [x] All sections detailed with examples
- [x] Reviewed by architecture team
- [x] Integrated seamlessly with existing design doc

**Success Criteria:**
- ✅ Team expectations set about limitations
- ✅ Risks documented and owned
- ✅ Failure modes have documented recovery
- ✅ No surprises post-deployment

**Next Actions:**
1. Technical writer drafts all three sections
2. Architecture team reviews for completeness
3. Merge into design-document.md
4. Communicate changes to team

---

### 3.3 Marketplace API Error Handling Specification

**Status:** 🔲 Not Started  
**Effort:** 4-6 hours  
**Owner:** Backend lead  
**Priority:** MEDIUM (prevents silent metering failures)

**Objective:**
Document how to handle every Marketplace API error scenario (429, 500, 401, etc.).

**Deliverable: "Marketplace API Error Handling Guide"**
```markdown
# Marketplace API Error Handling

## HTTP Status Code Handlers

### 429 Too Many Requests (Rate Limited)

**Cause:** We exceeded Marketplace rate limits (estimated ~100 req/min per subscription)

**Handling:**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers['retry-after'] || '60';
  logger.warn('Rate limited by Marketplace', {
    subscriptionId: subscription.id,
    retryAfter,
  });

  // Circuit breaker: Stop retrying after 5 consecutive 429s
  circuitBreaker.recordFailure();
  if (circuitBreaker.isOpen()) {
    // Move to dead-letter queue for manual review
    await moveToDeadLetterQueue(batch);
    return;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s
  await sleep(Math.pow(2, retryCount) * 1000);
  return retry();
}
```

**Prevention:**
- Batch metering: Max 100 events per submission (not 10,000)
- Rate limiting client-side: Space out submissions by 30 seconds minimum
- Monitoring: Alert if rate limiting occurs more than once per day

---

### 500 Internal Server Error

**Cause:** Marketplace backend issue (temporary outage)

**Handling:**
```typescript
if (response.status === 500) {
  logger.error('Marketplace API internal error', {
    subscriptionId: subscription.id,
  });

  // Retry with exponential backoff
  if (retryCount < 5) {
    await sleep(Math.pow(2, retryCount) * 1000);
    return retry();
  }

  // After 5 retries, move to DLQ
  await moveToDeadLetterQueue(batch);
  
  // Alert: If Marketplace 500 for > 15 minutes, escalate to Microsoft
  alertIfDurationExceeds('marketplace-500', 15);
}
```

**Prevention:**
- Monitor Marketplace status page (alerting when they report incidents)
- Check their API health endpoint before submitting batches

---

### 401 Unauthorized

**Cause:** Authentication token expired or invalid

**Handling:**
```typescript
if (response.status === 401) {
  logger.error('Marketplace auth failed', {
    subscriptionId: subscription.id,
  });

  // Refresh token from Key Vault
  const newToken = await refreshMarketplaceToken();
  
  // Retry immediately with new token
  return retryWithToken(newToken);
}
```

**Prevention:**
- Token refresh: Proactively refresh 10 minutes before expiry
- Monitoring: Alert if token refresh fails
- Credentials: Store in Key Vault, rotate quarterly

---

### 400 Bad Request

**Cause:** Invalid metering data (dimension ID not found, quantity negative, etc.)

**Handling:**
```typescript
if (response.status === 400) {
  const errorDetail = response.body.error.details;
  logger.error('Invalid metering data', {
    subscriptionId: subscription.id,
    dimension: batch[0].dimensionId,
    error: errorDetail,
  });

  // DO NOT RETRY - this is a permanent error
  // Move to DLQ for manual investigation
  await moveToDeadLetterQueue(batch);
  
  // Alert: Invalid metering must be investigated
  alert('Invalid metering submitted', {
    severity: 'HIGH',
    action: 'Review DLQ and fix dimension mapping',
  });
}
```

**Prevention:**
- Validate: Check dimension exists before submitting
- Validate: Check quantity >= 0
- Test: Submit sample metering in staging before going live

---

### Partial Success (Some Events Accepted, Some Rejected)

**Cause:** Mixed batch (some events valid, some invalid)

**Handling:**
```typescript
if (response.status === 207) {  // Multi-status response
  const accepted = response.body.accepted;
  const rejected = response.body.rejected;

  logger.info('Partial metering success', {
    accepted: accepted.length,
    rejected: rejected.length,
  });

  // Track accepted events
  await markAsSubmitted(accepted);

  // Retry rejected events individually
  for (const failed of rejected) {
    if (failed.error.code === 'DIMENSION_NOT_FOUND') {
      // Permanent error - move to DLQ
      await moveToDeadLetterQueue([failed.event]);
    } else if (failed.error.code === 'RATE_LIMITED') {
      // Temporary error - retry
      await retryEvent(failed.event);
    }
  }
}
```

---

## Circuit Breaker Strategy

**Purpose:** Stop retrying when Marketplace is down, queue events instead

```typescript
class MarketplaceCircuitBreaker {
  private failureCount = 0;
  private failureThreshold = 5;
  private openAt: Date | null = null;

  shouldAttemptRequest(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      // Circuit is open - fail fast
      const timeSinceOpen = Date.now() - this.openAt.getTime();
      if (timeSinceOpen > 5 * 60 * 1000) {
        // After 5 minutes, try again (half-open)
        this.failureCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.openAt = null;
  }

  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.openAt = new Date();
      logger.warn('Marketplace circuit breaker OPEN');
      alert('Marketplace API circuit breaker opened', {
        severity: 'MEDIUM',
        action: 'Metering queued locally, will retry automatically',
      });
    }
  }
}
```

---

## Monitoring & Alerting

```yaml
alerts:
  - name: "Marketplace API rate limit"
    condition: "count(status=429) > 0"
    duration: "1m"
    severity: "MEDIUM"
    action: "Check batch size, reduce if > 100 events"

  - name: "Marketplace API server error"
    condition: "count(status=500) > 0"
    duration: "1m"
    severity: "MEDIUM"
    action: "Check Marketplace status page, escalate if > 15min"

  - name: "Marketplace API auth failure"
    condition: "count(status=401) > 0"
    duration: "1m"
    severity: "HIGH"
    action: "Check token, refresh from Key Vault"

  - name: "Marketplace API invalid request"
    condition: "count(status=400) > 5 in 1h"
    duration: "1m"
    severity: "HIGH"
    action: "Review metering data schema, investigate DLQ"

  - name: "Marketplace circuit breaker OPEN"
    condition: "circuitBreaker.isOpen()"
    duration: "5m"
    severity: "CRITICAL"
    action: "Immediate: Check Marketplace status, wait for recovery"

  - name: "Dead-letter queue growing"
    condition: "dlq.depth > 100"
    duration: "10m"
    severity: "HIGH"
    action: "Review DLQ items, investigate root cause, manual replay"
```

---

## Testing Error Scenarios

**Staging Test Suite:**
```typescript
describe('Marketplace API error handling', () => {
  test('handles 429 rate limiting with backoff', async () => {
    mockMarketplace.setResponseCode(429);
    const start = Date.now();
    await submitMetering(batch);
    const elapsed = Date.now() - start;
    
    // Should retry with backoff (1s + 2s = 3s minimum)
    expect(elapsed).toBeGreaterThan(3000);
  });

  test('handles 500 with exponential backoff', async () => {
    mockMarketplace.setResponseCode(500);
    const result = await submitMetering(batch);
    
    // Should retry up to 5 times
    expect(mockMarketplace.callCount).toBe(5);
    expect(result.status).toBe('DLQ'); // Moved to DLQ
  });

  test('handles 401 with token refresh', async () => {
    mockMarketplace.setResponseCode(401);
    const result = await submitMetering(batch);
    
    // Should refresh token and retry
    expect(tokenRefresh.callCount).toBe(1);
    expect(result.status).toBe('SUCCESS');
  });

  test('handles 400 bad request without retry', async () => {
    mockMarketplace.setResponseCode(400);
    const result = await submitMetering(batch);
    
    // Should NOT retry, move to DLQ immediately
    expect(mockMarketplace.callCount).toBe(1);
    expect(result.status).toBe('DLQ');
  });
});
```
```

**Definition of Done:**
- [x] Every HTTP error code documented (4xx, 5xx)
- [x] Retry strategy specified for each scenario
- [x] Circuit breaker logic implemented
- [x] Monitoring + alerting rules defined
- [x] Test scenarios for all error types

**Success Criteria:**
- ✅ No silent metering failures
- ✅ Marketplace outages handled gracefully
- ✅ DLQ tracks all failed submissions
- ✅ Alerts prevent data loss

**Next Actions:**
1. Backend lead drafts error handling specification
2. Implement error handlers in metering service
3. Add tests for all scenarios
4. Deploy to staging and validate against Marketplace sandbox

---

## 📊 Summary: All Priority Tiers

| Priority | Items | Total Effort | Duration | Key Deliverables |
|----------|-------|--------------|----------|------------------|
| **1: Critical Blockers** | 3 | 12-17 hours | Week 1 | Prisma decision, Phase 1 scope, tech stack |
| **2: Security/Ops** | 3 | 18-26 hours | Week 2 | Metering spec, tenant isolation, prod readiness |
| **3: Documentation** | 3 | 24-32 hours | Week 3 | Migration guide, design sections, error handling |
| **4: Architecture** | 3 | 16-22 hours | Week 4 | Performance spec, observability, RBAC matrix |
| **5: Validation** | 4 | 16-22 hours | Week 5 | Security testing, cost model, team alignment |
| **TOTAL** | **16** | **86-119 hours** | **3-5 weeks** | Full design specification + operational readiness |

**Recommended Execution:**
- Week 1: Complete Priority 1 (blocking items)
- Weeks 2-3: Parallel execution of Priority 2 + 3 (8 items, 42-58 hours)
- Weeks 4-5: Priority 4 + 5 (7 items, 32-44 hours)
- **Implementation greenlight:** After Priority 1 + 2 complete (~2 weeks)

---

**Phase 5: Discover Complete**  
**Follow-Up Work Items:** 16 identified, prioritized, and fully documented  
**Next Action:** Team review and prioritization meeting (2 hours, followed by execution kickoff)
