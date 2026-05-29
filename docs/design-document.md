<!-- markdownlint-disable-file -->
# FastSaaS: Next-Gen Microsoft Marketplace SaaS Accelerator

**Design Document**  
**Date:** May 29, 2026  
**Version:** 1.0  
**Status:** Design Phase

---

## Executive Summary

FastSaaS is a modern, cloud-native implementation of a Microsoft Commercial Marketplace SaaS accelerator built with Node.js and TypeScript. It reimagines the original .NET-based accelerator with contemporary architecture patterns, enhanced developer experience, and production-grade observability.

Rather than a straight port, FastSaaS:
- **Modernizes the stack** with Node.js/TypeScript, React/Next.js, and serverless-first patterns
- **Improves multi-tenancy** with built-in tenant isolation and workspace patterns
- **Enhances observability** with distributed tracing, structured logging, and comprehensive monitoring
- **Streamlines deployment** with containerization and Infrastructure as Code (Bicep/Terraform)
- **Accelerates development** with API-first design, code generation, and testing frameworks
- **Maintains compatibility** with Microsoft Commercial Marketplace Fulfillment APIs v2 and Metering APIs

---

## Table of Contents

1. [Vision & Goals](#vision--goals)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Core Components](#core-components)
5. [Data Model](#data-model)
6. [Security & Multi-Tenancy](#security--multi-tenancy)
7. [API Design](#api-design)
8. [Deployment Options](#deployment-options)
9. [Observability & Monitoring](#observability--monitoring)
10. [Development Workflow](#development-workflow)
11. [Migration & Upgrade Path](#migration--upgrade-path)
12. [Phase Roadmap](#phase-roadmap)

---

## Vision & Goals

### Vision Statement

Enable SaaS builders to launch production-ready marketplace integrations in minutes—not months—with a modern, secure, and observable platform that grows with their business.

### Design Goals

| Goal | Description |
|------|-------------|
| **Developer Experience** | TypeScript-first, end-to-end type safety, local dev environment works in seconds |
| **Production Ready** | Built-in observability, security, multi-tenancy, and resilience patterns |
| **Cloud Native** | Container-first, serverless options, infrastructure as code, zero-ops where possible |
| **Extensibility** | Plugin architecture for custom billing, integrations, and workflows |
| **Performance** | Sub-100ms API latency, optimized database queries, efficient resource usage |
| **Standards** | OpenAPI/Swagger, OpenTelemetry, OIDC/OAuth2, industry best practices |

---

## Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    External Systems                          │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │ Microsoft Commercial │  │    Customer Billing System   │ │
│  │   Marketplace APIs   │  │   (Stripe, Chargebee, etc)   │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└──────────┬─────────────────────────────────┬─────────────────┘
           │                                 │
      ┌────▼──────────────────────────────────▼────┐
      │     FastSaaS API Gateway & Router           │
      │  (Request validation, routing, auth)        │
      └───┬──────────────────────────────────┬──────┘
          │                                  │
    ┌─────▼──────────┐             ┌────────▼────────┐
    │  Tenant Portal │             │  Publisher API  │
    │   (Customer)   │             │  (Admin Portal) │
    │  Next.js App   │             │  Next.js App    │
    └────────────────┘             └─────────────────┘
          │                                 │
    ┌─────┴─────────────────────────────────┴─────┐
    │    FastSaaS Core Services Layer              │
    │  ┌───────────────────────────────────────┐   │
    │  │  Subscription Service                 │   │
    │  │  Metering Service                     │   │
    │  │  Tenant Service                       │   │
    │  │  Billing Service                      │   │
    │  │  Authentication Service               │   │
    │  │  Webhook Service                      │   │
    │  └───────────────────────────────────────┘   │
    └──────────┬──────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │       Data Persistence Layer                │
    │  ┌──────────────┐      ┌──────────────────┐ │
    │  │ PostgreSQL   │      │  Redis Cache     │ │
    │  │ (Multi-tenant│      │  (Sessions &     │ │
    │  │  data)       │      │   Events)        │ │
    │  └──────────────┘      └──────────────────┘ │
    └─────────────────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────┐
    │    Observability & Event Systems            │
    │  ┌──────────────┐      ┌──────────────────┐ │
    │  │ Application  │      │  Outbox Worker   │ │
    │  │ Insights     │      │  (PostgreSQL)    │ │
    │  └──────────────┘      └──────────────────┘ │
    └─────────────────────────────────────────────┘
```

### Deployment Models

FastSaaS supports multiple deployment topologies:

**Single-Tenant Deployment** (Simplest)
- Single database, single app instance
- Best for: Early validation, proof-of-concept

**Multi-Tenant (Shared Database)**
- Multiple tenants in shared database with row-level security
- Best for: SaaS platforms, managed services
- Optimal scalability & cost efficiency

**Multi-Tenant (Isolated Databases)**
- Each tenant has dedicated database
- Best for: Enterprise customers, data residency requirements
- Maximum isolation at higher operational cost

**Multi-Region**
- Regional deployment with failover
- Best for: Global customers, compliance requirements
- Enterprise-grade resilience

---

## Technology Stack

### Backend Services

```
Runtime & Language
├── Node.js 22 (LTS)
├── TypeScript 5.x
└── Deno (optional, for serverless functions)

Web Framework & HTTP
├── Express.js (core APIs)
├── Fastify (high-throughput alternative)
├── Hono (edge runtime compatible)
└── REST with OpenAPI/Swagger

Authentication & Authorization
├── @azure/identity (Entra ID, workload identity)
├── @azure/msal-node (OAuth2/OIDC)
├── jose (JWT handling)
└── passport.js (optional, for multi-provider)

Database & Persistence
├── PostgreSQL 15+ (primary)
├── @prisma/client (ORM)
├── node-postgres / pg (query builder)
├── Drizzle ORM (alternative, lightweight)
└── Redis 7+ (caching, sessions)

Messaging & Events
├── PostgreSQL outbox + worker (Phase 1 default)
├── @azure/event-hubs (Phase 2 scale option)
├── amqplib (RabbitMQ alternative)
└── node-nats (NATS alternative)

Observability
├── @azure/app-insights (Application Insights)
├── @opentelemetry/* (distributed tracing)
├── pino (structured logging)
└── prometheus (metrics collection)

HTTP Client & API Integration
├── axios (general HTTP client)
├── @azure/core-rest-pipeline (Azure SDK pattern)
├── graphql-request (optional, for GraphQL)
└── undici (HTTP/2, fetch API)

Testing
├── Vitest (unit & integration tests)
├── Playwright (end-to-end tests)
├── Jest (backward compatibility)
├── ts-node (test utilities)
└── @faker-js/faker (test data generation)
```

### Frontend (Customer & Publisher Portals)

```
Framework & Build
├── Next.js 14+ (App Router)
├── React 18+
├── TypeScript 5+
└── Vite (alternative, lightweight)

Styling & Components
├── Tailwind CSS 3+
├── shadcn/ui (component library)
├── Radix UI (headless UI)
└── Recharts (data visualization)

State Management
├── TanStack Query (React Query) - server state
├── Zustand (client state)
└── Jotai (atomic state management)

Authentication & Client
├── @auth/nextjs (NextAuth.js v5)
├── @azure/msal-react (Entra ID)
└── axios (HTTP client with interceptors)

Forms & Validation
├── React Hook Form
├── Zod (schema validation)
└── TanStack Form (framework-agnostic)

API Integration
├── OpenAPI TypeScript Codegen (auto-generated clients)
├── @swagger-ui/react (API documentation)
└── Mock Service Worker (MSW) for testing
```

### DevOps & Infrastructure

```
Containerization & Orchestration
├── Docker (container images)
├── Docker Compose (local development)
├── Kubernetes (enterprise deployment)
└── Azure Container Apps (serverless containers)

Infrastructure as Code
├── Bicep (Azure-native)
├── Terraform (multi-cloud, state management)
├── Azure CLI (scripting)
└── Pulumi (programmatic IaC)

CI/CD & Automation
├── GitHub Actions (pipeline orchestration)
├── Azure DevOps Pipelines (enterprise alternative)
├── Semantic Versioning (release management)
└── Dependabot (dependency updates)

Configuration Management
├── Environment variables (.env schema validation)
├── Azure Key Vault (secrets)
├── Azure App Configuration (feature flags)
└── dotenv-safe (development)

Monitoring & Logging
├── Azure Monitor (metrics, logs, alerts)
├── Azure Application Insights (APM)
├── ELK Stack (optional, self-hosted)
└── Datadog (optional, enterprise monitoring)

Code Quality
├── ESLint (JavaScript linting)
├── Prettier (code formatting)
├── SonarQube (code quality analysis)
├── OWASP Dependency-Check (security)
└── Trivy (container image scanning)

Version Control & Collaboration
├── Git + GitHub/Azure DevOps
├── Conventional Commits (commit messaging)
├── Husky (git hooks)
└── Semantic Release (automated versioning)
```

### Phase 1 Technology Decisions (Locked)

To prevent implementation drift, Phase 1 uses the following non-optional defaults:

| Area | Decision | Rationale | Revisit Trigger |
|------|----------|-----------|-----------------|
| API framework | Express.js | Team familiarity and ecosystem maturity | p95 latency > 250 ms at 10k RPS |
| ORM strategy | Prisma + tenant middleware + PostgreSQL RLS | Fast delivery while keeping RLS as defense-in-depth | Move to Drizzle/Kysely only if Prisma limits block isolation guarantees |
| Server state | TanStack Query | Consistent API caching and retries | No change planned in Phase 1 |
| Client/global state | Zustand | Minimal boilerplate for portal state | No change planned in Phase 1 |
| Primary hosting | Azure Container Apps | Best default for cost and scale in MVP | App Service only for migration compatibility |
| Event transport | PostgreSQL outbox + worker | Lowest operational complexity for MVP while preserving reliability controls | Move to Event Hubs when sustained throughput or fan-out demands it |
| UI component baseline | Tailwind CSS + shadcn/ui | Faster implementation consistency | No change planned in Phase 1 |

Items marked as alternatives elsewhere in this document are backlog options, not implementation options for Phase 1.

---

## Core Components

### 1. API Gateway & Authentication Service

**Purpose:** Unified entry point for all API requests with cross-cutting concerns.

**Responsibilities:**
- Request routing and versioning
- Authentication (Entra ID, JWT validation)
- Authorization (RBAC, tenant isolation)
- Rate limiting & throttling
- Request/response logging & transformation
- API documentation (OpenAPI/Swagger)

**Technology:** Express.js + express-oauth2-jwt-bearer + openapi-backed validation

**Key Files:**
```
src/api/
├── middleware/
│   ├── auth.ts              # Authentication middleware
│   ├── errorHandler.ts      # Global error handling
│   ├── logging.ts           # Request/response logging
│   ├── rateLimit.ts         # Rate limiting
│   └── tenantContext.ts     # Tenant isolation
├── routes/
│   ├── v1/
│   │   ├── subscriptions.ts
│   │   ├── metering.ts
│   │   ├── billing.ts
│   │   └── webhooks.ts
│   └── v2/
│       └── ...
└── openapi.yaml            # OpenAPI specification
```

### 2. Subscription Service

**Purpose:** Manages subscription lifecycle and marketplace integration.

**Responsibilities:**
- Subscription creation, activation, suspension, cancellation
- Plan management and seat allocation
- SaaS Fulfillment API v2 integration
- Webhook processing from marketplace
- Subscription state machine implementation
- Trial period management

**Domain Model:**
```typescript
interface Subscription {
  id: string;
  tenantId: string;
  marketplaceSubscriptionId: string;
  planId: string;
  seats: number;
  status: 'PendingFulfillment' | 'Subscribed' | 'Suspended' | 'Unsubscribed';
  billingTerm: 'Monthly' | 'Yearly' | '1Year' | '3Year';
  renewalTerm?: string;
  purchaseDate: Date;
  expiryDate?: Date;
  metadata: Record<string, unknown>;
}

interface Plan {
  id: string;
  marketplacePlanId: string;
  displayName: string;
  description: string;
  isPrivate: boolean;
  features: Feature[];
  basePrice: number;
  billingFrequency: 'Monthly' | 'Yearly';
  metering?: MeteringDimension[];
}

interface MeteringDimension {
  id: string;
  displayName: string;
  unit: string;
  includedQuantity: number;
  pricePerUnit: number;
}
```

**Example Workflow:**
```
1. Customer selects plan on marketplace
2. Marketplace sends landing-page-token
3. Customer redirected to /subscriptions/new?token=xxx
4. System validates token with marketplace
5. Customer confirms subscription
6. System calls Fulfill API
7. Subscription moves to "Subscribed" state
8. Customer gains access to portal
```

### 3. Metering Service

**Purpose:** Collects and reports usage to Azure Marketplace for metered billing.

**Responsibilities:**
- Usage event ingestion and buffering
- Metered usage aggregation
- Batch submission to Metering API
- Duplicate event deduplication
- Usage analytics and reporting
- Rate limiting per dimension

**Event Processing Pipeline:**
```
Event Ingestion (API + PostgreSQL Outbox)
    ↓
Validation & Deduplication (Redis)
    ↓
Aggregation (Time windows, by dimension)
    ↓
Batch Submission to Metering API
    ↓
Event Storage (Database)
    ↓
Analytics & Reporting
```

**Data Structures:**
```typescript
interface UsageEvent {
  subscriptionId: string;
  dimensionId: string;
  quantity: number;
  timestamp: Date;
  idempotencyKey?: string;
}

interface MeteringSubmission {
  subscriptionId: string;
  timestamp: Date;
  usages: {
    dimension: string;
    quantity: number;
  }[];
  status: 'Pending' | 'Submitted' | 'Acknowledged' | 'Failed';
}
```

**Reliability Contract (Phase 1):**
- Submission cadence: every 15 minutes
- Batch size: 500 usage events (flush early when batch reaches limit)
- Queue max age: 60 minutes (force submit before deadline)
- Submission SLA: 99.9% of usage events submitted within 4 hours of event time
- Idempotency retention: 30 days (tenant-scoped)
- Retry policy: exponential backoff with jitter for 429/5xx (max 8 retries, max delay 15 minutes)
- Terminal failure policy: move to dead-letter queue (DLQ) after retry exhaustion
- Reconciliation window: hourly reconciliation between queued, submitted, and acknowledged counts

**Marketplace API Failure Handling:**
- 429 (rate limit): retry with backoff, honor `Retry-After`, and lower worker concurrency by 50% for 15 minutes
- 500/502/503/504: retry with backoff and circuit breaker
- 401/403: refresh token once, retry once, then page on-call and pause new submissions
- Partial batch failure: split batch into per-event retries using original idempotency keys

**Circuit Breaker Settings:**
- Open after 5 consecutive failures or 50% failure rate over 5 minutes
- Half-open after 2 minutes
- Close after 10 consecutive successful submissions

**Metering Runbook Triggers:**
- Page on-call if DLQ depth > 100 for 10 minutes
- Page on-call if submission SLA burn rate exceeds 2x budget for 30 minutes
- Open incident if month-end backlog projects missed billing cutoff

**Scale Trigger for Event Hubs (Phase 2):**
- Adopt Event Hubs when sustained ingest exceeds outbox processing headroom or when multiple independent consumers require replay from a shared stream

### 4. Tenant Service

**Purpose:** Multi-tenancy management and workspace isolation.

**Responsibilities:**
- Tenant provisioning and configuration
- Workspace management
- User-to-tenant mapping
- Tenant isolation enforcement
- Row-level security policies
- Tenant-specific feature flags

**Key Concepts:**
- **Tenant:** Top-level organization (customer company)
- **Workspace:** Logical grouping of resources within tenant
- **User:** Individual user with role assignment
- **Role:** RBAC role (Admin, Owner, Member, Viewer)

**Tenant Context Middleware:**
```typescript
// Extracts tenant from token/request and injects into context
req.context = {
  tenantId: string;
  userId: string;
  roles: string[];
  workspace?: string;
}

// All queries automatically filtered by tenantId
```

### 5. Billing Service

**Purpose:** Integrates with external billing systems for advanced billing scenarios.

**Responsibilities:**
- Invoice generation
- Credit/debit management
- Tax calculation
- Payment processing orchestration
- Billing cycle management
- Custom pricing models
- Integration with Stripe, Chargebee, etc.

**Design Note:** Designed for flexibility—can work with Marketplace billing alone or integrate external systems.

### 6. Webhook Service

**Purpose:** Handles inbound and outbound webhook events.

**Responsibilities:**
- Marketplace webhook ingestion (subscription lifecycle)
- Webhook validation and signature verification
- Event routing and processing
- Retry logic with exponential backoff
- Webhook management UI
- Event log/audit trail

**Webhook Reliability Specification (Phase 1):**
- Signature algorithm: HMAC-SHA256 over raw body and timestamp header
- Replay window: 5 minutes max clock skew
- Retry schedule: 1m, 2m, 4m, 8m, 16m (max 5 attempts)
- Post-retry action: move to webhook DLQ and create actionable incident
- Idempotency key: `{tenantId}:{provider}:{eventId}` retained 30 days
- Manual replay endpoint requires Admin or Owner role and reason code

**Marketplace Webhooks Handled:**
- `ChangePlan` — Customer downgrades/upgrades
- `ChangeQuantity` — Seat count changes
- `Suspend` — Subscription suspended
- `Unsubscribe` — Subscription canceled
- `Reinstate` — Suspended subscription reactivated
- `Transfer` — Subscription transferred to new tenant

### 7. Analytics & Reporting Service

**Purpose:** Provides insights into business metrics and usage patterns.

**Responsibilities:**
- Revenue dashboards
- Customer cohort analysis
- Usage trending
- Churn prediction
- Custom report generation
- Data export (CSV, Parquet)

**Key Metrics:**
- Monthly recurring revenue (MRR)
- Annual recurring revenue (ARR)
- Customer acquisition cost (CAC)
- Customer lifetime value (CLV)
- Churn rate
- Net dollar retention

---

## Data Model

### Entity Relationship Diagram

```
┌──────────────┐
│   Tenant     │
├──────────────┤
│ id (PK)      │
│ name         │
│ created_at   │
└──────────────┘
      │ 1
      │
      │ *
      ├─────────────────┬──────────────────┬─────────────────┐
      │                 │                  │                 │
      ▼ *               ▼ *                ▼ *               ▼ *
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────────┐
│   User       │ │ Subscription │ │     Plan      │ │   Workspace    │
├──────────────┤ ├──────────────┤ ├───────────────┤ ├────────────────┤
│ id (PK)      │ │ id (PK)      │ │ id (PK)       │ │ id (PK)        │
│ email        │ │ status       │ │ display_name  │ │ name           │
│ role         │ │ plan_id (FK) │ │ base_price    │ │ config         │
└──────────────┘ │ seats        │ └───────────────┘ └────────────────┘
                 │ status       │         │ *
                 └──────────────┘         │
                        │                 │
                        │ *               │ *
                        │                 │
                   ┌────▼─────────┐      ┌▼─────────────────┐
                   │ UsageEvent   │      │ MeteringDimension│
                   ├──────────────┤      ├───────────────────┤
                   │ id (PK)      │      │ id (PK)           │
                   │ sub_id (FK)  │      │ plan_id (FK)      │
                   │ dimension_id │      │ unit              │
                   │ quantity     │      │ price_per_unit    │
                   │ timestamp    │      └───────────────────┘
                   └──────────────┘
```

### Schema Design (PostgreSQL)

```sql
-- Core tables with Row-Level Security (RLS)
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) NOT NULL,
  entra_id VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  marketplace_subscription_id VARCHAR(255) UNIQUE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(50) NOT NULL,
  seats INT DEFAULT 1,
  billing_term VARCHAR(50),
  renewal_term VARCHAR(50),
  purchase_date TIMESTAMP,
  expiry_date TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, marketplace_subscription_id)
);

CREATE TABLE plans (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  marketplace_plan_id VARCHAR(255),
  display_name VARCHAR(255) NOT NULL,
  base_price DECIMAL(10,2),
  billing_frequency VARCHAR(50),
  is_private BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE metering_dimensions (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id),
  display_name VARCHAR(255),
  unit VARCHAR(100),
  included_quantity INT,
  price_per_unit DECIMAL(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE usage_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  dimension_id UUID NOT NULL REFERENCES metering_dimensions(id),
  quantity DECIMAL(10,2),
  idempotency_key VARCHAR(255) UNIQUE,
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE webhooks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type VARCHAR(100),
  payload JSONB,
  status VARCHAR(50),
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Row-Level Security (RLS) policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON subscriptions
  USING (tenant_id = current_user_tenant_id());
```

### Database Performance Targets and Index Strategy

**Query SLOs (Phase 1 and 1.5):**

| Query Path | Target | Notes |
|------------|--------|-------|
| Subscription list by tenant | p95 <= 100 ms | Includes pagination and status filter |
| Subscription detail by id | p95 <= 50 ms | Point lookup on tenant and id |
| Metering event ingest write | p95 <= 30 ms | Single event write path |
| Metering hourly aggregation | p95 <= 500 ms | Tenant and time-window constrained |
| Tenant dashboard summary | p95 <= 2 s | Pre-aggregated metrics preferred |

**Required Indexes:**

```sql
CREATE INDEX idx_subscriptions_tenant_status_created
  ON subscriptions (tenant_id, status, created_at DESC);

CREATE INDEX idx_subscriptions_tenant_marketplace
  ON subscriptions (tenant_id, marketplace_subscription_id);

CREATE INDEX idx_usage_events_tenant_subscription_ts
  ON usage_events (tenant_id, subscription_id, timestamp DESC);

CREATE INDEX idx_usage_events_tenant_dimension_ts
  ON usage_events (tenant_id, dimension_id, timestamp DESC);

CREATE UNIQUE INDEX idx_usage_events_tenant_idempotency
  ON usage_events (tenant_id, idempotency_key);

CREATE INDEX idx_webhooks_tenant_status_created
  ON webhooks (tenant_id, status, created_at DESC);
```

**Capacity and Degradation Policy:**
- PostgreSQL connection pool hard limit: 100 active connections per app instance
- Scale-up trigger: p95 DB latency above 200 ms for 10 minutes
- Backpressure trigger: queue writes when DB CPU exceeds 80% for 5 minutes
- Degraded mode behavior: prioritize fulfillment and metering write paths, defer analytics queries

---

## Security & Multi-Tenancy

### Authentication Flow

```
User Login Flow:
1. User navigates to /login
2. Redirected to Entra ID OAuth endpoint
3. User authenticates with Entra ID
4. Entra ID returns ID token + access token
5. Application validates tokens using Key Vault certificates
6. Application creates session (JWT or secure cookie)
7. User redirected to dashboard

Subsequent Requests:
1. Client sends request with JWT in Authorization header
2. API middleware validates JWT signature
3. Extract tenant_id and user_id from claims
4. Inject into request context
5. All database queries filtered by tenant_id
```

### Authorization Model

```
Role-Based Access Control (RBAC):
├── Admin (Full access to tenant settings)
├── Owner (Billing, team management)
├── Member (Read/write own resources)
└── Viewer (Read-only access)

Feature-Based Authorization:
├── Can perform subscription actions? check("subscription:manage")
├── Can view metering? check("metering:read")
└── Can access admin panel? check("admin:access")

Resource-Based Authorization:
├── User can only access subscriptions for their tenant
├── Query filters automatically applied by middleware and validated by RLS
└── Cross-tenant access is blocked by layered controls (auth context, middleware, DB policy)
```

**Permissions Matrix (Phase 1):**

| Action | Admin | Owner | Member | Viewer |
|--------|-------|-------|--------|--------|
| View subscriptions | Yes | Yes | Yes | Yes |
| Change plan or quantity | Yes | Yes | No | No |
| Manage billing settings | Yes | Yes | No | No |
| Invite or remove users | Yes | Yes | No | No |
| View metering analytics | Yes | Yes | Yes | Yes |
| Export usage and billing CSV | Yes | Yes | No | No |
| View audit logs (tenant-scoped) | Yes | Yes | No | No |
| Configure webhooks | Yes | Yes | No | No |

### Multi-Tenancy Implementation

**Shared Database with Tenant Middleware + Row-Level Security (RLS)**
```typescript
// Prisma middleware injects tenant filters into every read/write operation.
prisma.$use(async (params, next) => {
  const tenantId = tenantContext.getRequiredTenantId();

  if (params.action === 'findMany' || params.action === 'findFirst' || params.action === 'count') {
    params.args = params.args ?? {};
    params.args.where = {
      ...(params.args.where ?? {}),
      tenantId,
    };
  }

  if (params.action === 'create') {
    params.args = params.args ?? {};
    params.args.data = {
      ...(params.args.data ?? {}),
      tenantId,
    };
  }

  return next(params);
});
```

RLS remains mandatory and is treated as defense-in-depth. Application-layer tenant middleware is primary enforcement for Prisma queries.

**Tenant Isolation Checklist:**
- ✅ Authentication enforces tenant context
- ✅ Every table has `tenant_id` column
- ✅ Prisma middleware injects tenant filters for all ORM operations
- ✅ Database RLS policies enforce tenant boundaries at the database layer
- ✅ Caching keys follow `cache:v1:{tenantId}:{resource}:{id}`
- ✅ Logging includes tenant_id for auditing
- ✅ File storage segregated by tenant prefix with deny-by-default IAM
- ✅ Webhooks validate tenant ownership and source authenticity

**Webhook Validation Controls:**
- Verify source signature and timestamp before payload parsing
- Validate event uniqueness with key `{tenantId}:{eventId}` in Redis and database
- Resolve `marketplaceSubscriptionId` to tenant and reject mismatches
- Accept replay only for idempotent reprocessing paths

**Audit Logging Controls:**
- Audit entries are append-only and include `tenant_id`, actor, action, resource, and request correlation id
- Tenant admins can only query their own tenant audit logs
- Support access to audit logs requires break-glass workflow and explicit ticket id
- Retention policy: 365 days hot, 7 years archive for compliance export

**File Storage Segregation:**
- Single storage account with tenant-scoped prefixes: `tenants/{tenantId}/...`
- Managed identity policy allows access only to approved tenant prefix
- Upload pipeline enforces tenant prefix at API boundary and signs scoped URLs

### Data Encryption

```
Encryption at Rest:
├── PostgreSQL full-disk encryption (Azure)
├── TDE (Transparent Data Encryption) enabled
├── Sensitive fields encrypted with master key
└── PII encrypted before storage

Encryption in Transit:
├── All traffic over TLS 1.3
├── HSTS headers enforced
├── Certificate pinning for marketplace APIs
└── Encrypted connection strings in Key Vault
```

### Secrets Management

```typescript
// Never commit secrets—use Key Vault
const config = {
  marketplace: {
    clientId: await getSecret('marketplace-client-id'),
    clientSecret: await getSecret('marketplace-client-secret'),
  },
  database: {
    url: await getSecret('database-connection-string'),
  },
};

// Development: .env.local (git-ignored)
// Production: Azure Key Vault (managed)
```

---

## API Design

### REST API Architecture

**Base URL:** `https://api.fastsaas.dev/v1`

**Authentication:** Bearer token (JWT) or OAuth2

**Response Format:** JSON with consistent envelope

```typescript
interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    version: string;
  };
}

// Example response
{
  "status": "success",
  "data": {
    "id": "sub_123",
    "status": "Subscribed",
    "planId": "plan_pro"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-05-29T10:30:00Z",
    "version": "v1"
  }
}
```

### Core Endpoints

#### Subscriptions

```
GET    /subscriptions              # List subscriptions
POST   /subscriptions              # Create subscription
GET    /subscriptions/:id          # Get subscription
PATCH  /subscriptions/:id          # Update subscription
DELETE /subscriptions/:id          # Cancel subscription
POST   /subscriptions/:id/activate # Activate subscription
POST   /subscriptions/:id/suspend  # Suspend subscription
```

#### Metering

```
POST   /metering/usage             # Submit usage event
GET    /metering/dimensions        # List billing dimensions
GET    /metering/usage/:subId      # Get usage history
GET    /metering/forecast          # Forecast charges
```

#### Plans

```
GET    /plans                      # List plans
POST   /plans                      # Create plan
GET    /plans/:id                  # Get plan
PATCH  /plans/:id                  # Update plan
POST   /plans/:id/dimensions       # Add dimension
```

#### Marketplace Webhooks

```
POST   /webhooks/marketplace       # Inbound webhooks
GET    /webhooks                   # List webhook events
POST   /webhooks/:id/retry         # Retry failed webhook
```

#### Admin

```
GET    /admin/tenants              # List tenants (super-admin)
POST   /admin/tenants              # Create tenant
GET    /admin/metrics              # System metrics
GET    /admin/audit-log            # Audit trail
```

### GraphQL Alternative

Optional GraphQL endpoint for complex queries:

```graphql
query {
  subscriptions(first: 10) {
    edges {
      node {
        id
        status
        plan {
          displayName
          basePrice
          dimensions {
            id
            displayName
            pricePerUnit
          }
        }
        usage {
          dimension
          quantity
          forecast
        }
      }
    }
  }
}
```

### Error Handling

```typescript
// Standard error codes
enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// Example error response
{
  "status": "error",
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Subscription quantity cannot exceed plan maximum",
    "details": {
      "field": "seats",
      "received": 100,
      "maximum": 50
    }
  }
}
```

---

## Deployment Options

### Option 1: Azure App Service + PostgreSQL (Easiest)

**Best for:** Quick prototyping, SMB deployment

```bicep
param location string = resourceGroup().location
param environment string = 'dev'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'fastsaas-plan-${environment}'
  location: location
  sku: {
    name: 'B2'
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: 'fastsaas-api-${environment}'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
  }
}

resource database 'Microsoft.DBforPostgreSQL/servers@2017-12-01' = {
  name: 'fastsaas-db-${environment}'
  location: location
  properties: {
    administratorLogin: 'dbadmin'
    version: '15'
  }
}
```

**Pros:** Simple, managed by Azure, auto-scaling, monitoring included  
**Cons:** Less flexible, vendor lock-in, overkill for initial MVP

### Option 2: Azure Container Apps (Recommended)

**Best for:** Modern, serverless-first SaaS

```bicep
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'fastsaas-api'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      secrets: [
        {
          name: 'database-url'
          value: 'postgresql://user:pass@host/db'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'fastsaas-api'
          image: 'fastsaas.azurecr.io/api:${imageTag}'
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
          ]
          resources: {
            cpu: '0.5'
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}
```

**Pros:** Serverless, auto-scaling, great DX, reasonable cost  
**Cons:** Less transparent pricing than App Service

### Option 3: Kubernetes (Enterprise)

**Best for:** Multi-region, enterprise deployments

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastsaas-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fastsaas-api
  template:
    metadata:
      labels:
        app: fastsaas-api
    spec:
      containers:
      - name: api
        image: fastsaas.azurecr.io/api:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: fastsaas-secrets
              key: database-url
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

**Pros:** Maximum flexibility, enterprise features (RBAC, multi-region, disaster recovery)  
**Cons:** Operational complexity, requires DevOps expertise

### Option 4: Hybrid (On-Premises + Azure)

**Best for:** Compliance-heavy organizations

- Deploy compute on-premises or co-located
- Database in Azure for managed backups
- Marketplace APIs accessed via secure tunnel

---

## Observability & Monitoring

### Distributed Tracing

```typescript
// OpenTelemetry integration for end-to-end tracing
import { trace, context } from '@opentelemetry/api';

const tracer = trace.getTracer('fastsaas');

export async function createSubscription(req: Request) {
  const span = tracer.startSpan('subscription.create', {
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'tenant.id': req.context.tenantId,
    },
  });

  return context.with(
    trace.setSpan(context.active(), span),
    async () => {
      // Service calls within this context automatically create child spans
      const subscription = await subscriptionService.create(req.body);
      span.end();
      return subscription;
    }
  );
}
```

**Trace Flow Example:**
```
HTTP Request Received (span 1)
├── Auth & Validation (span 2)
├── Database: Create Subscription (span 3)
├── Event: Publish subscription.created (span 4)
│   └── Outbox: Insert event record (span 5)
├── External API: Marketplace fulfillment (span 6)
└── HTTP Response Sent (span 7 - closes root span)
```

### Structured Logging

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-azure-app-insights',
  },
});

// Example: User subscribes to plan
logger.info(
  {
    event: 'subscription.created',
    subscriptionId: sub.id,
    tenantId: req.context.tenantId,
    planId: req.body.planId,
    userId: req.context.userId,
    duration: Date.now() - startTime,
    metadata: {
      marketplaceId: sub.marketplaceSubscriptionId,
      seats: sub.seats,
    },
  },
  'User created subscription'
);
```

### Metrics & Dashboards

**Key Performance Indicators:**

```
Business Metrics:
├── MRR (Monthly Recurring Revenue)
├── ARR (Annual Recurring Revenue)
├── Customer Count
├── Active Subscriptions
├── Churn Rate
├── Net Dollar Retention

Technical Metrics:
├── API Response Time (p50, p95, p99)
├── Request Rate (requests/sec)
├── Error Rate (4xx, 5xx)
├── Database Query Duration
├── Cache Hit Ratio
├── Message Queue Depth
└── Resource Utilization (CPU, Memory)

Billing Metrics:
├── Usage Events Processed (daily, hourly)
├── Metering Submissions (success rate)
├── Revenue Recognized
└── Failed Billing Events
```

**Example Metrics Query (KQL):**
```kusto
customMetrics
| where name == "api.response.time"
| where timestamp >= ago(1d)
| summarize
    p50 = percentile(value, 50),
    p95 = percentile(value, 95),
    p99 = percentile(value, 99)
  by bin(timestamp, 1h)
| render timechart
```

### Tenant-Aware Observability

- Every metric, trace, and log record includes `tenantId` and `subscriptionId` when available
- Dashboards are split into platform-wide and tenant-scoped views
- Alert routing includes tenant context to reduce triage time
- Retention defaults: traces 30 days, logs 90 days, aggregated metrics 13 months

### Alerting Rules

```yaml
alerts:
  - name: "High API Error Rate"
    condition: "error_rate > 1%"
    duration: "5m"
    severity: "critical"
    action: "page on-call engineer"

  - name: "Database Connection Pool Exhausted"
    condition: "db_connections > 95"
    duration: "2m"
    severity: "critical"

  - name: "Metering API Failures"
    condition: "metering_failure_rate > 5%"
    duration: "10m"
    severity: "high"

  - name: "High Latency"
    condition: "p99_latency > 2000ms"
    duration: "10m"
    severity: "medium"
```

---

## Development Workflow

### Local Development Setup

**Prerequisites:**
```bash
node --version  # v22+
npm --version   # v10+
docker --version
```

**Quick Start:**
```bash
# Clone repository
git clone https://github.com/yourorg/fastsaas.git
cd fastsaas

# Install dependencies
npm install

# Start PostgreSQL and Redis
docker-compose up -d

# Run database migrations
npm run migrate

# Start development server
npm run dev

# API available at http://localhost:3000
# Documentation at http://localhost:3000/api/docs
```

**Monorepo Structure:**
```
fastsaas/
├── packages/
│   ├── api/              # Core API services
│   │   ├── src/
│   │   ├── tests/
│   │   └── package.json
│   ├── portal/           # Customer portal (Next.js)
│   ├── admin/            # Publisher portal
│   ├── sdk/              # TypeScript SDK for integrations
│   └── shared/           # Shared types, utilities
├── docker-compose.yml
├── .github/workflows/
└── package.json          # Root workspace config
```

### Testing Strategy

**Unit Tests** (Services, utilities):
```typescript
describe('SubscriptionService', () => {
  it('should create subscription with valid data', async () => {
    const sub = await service.create({
      tenantId: 'tenant_123',
      planId: 'plan_pro',
      seats: 5,
    });

    expect(sub).toMatchObject({
      status: 'PendingFulfillment',
      seats: 5,
    });
  });
});
```

**Integration Tests** (API endpoints, database):
```typescript
describe('POST /subscriptions', () => {
  it('should create and activate subscription', async () => {
    const response = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        planId: 'plan_pro',
        seats: 5,
      })
      .expect(201);

    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.status).toBe('PendingFulfillment');
  });
});
```

**End-to-End Tests** (User workflows with Playwright):
```typescript
import { test, expect } from '@playwright/test';

test('customer can subscribe to plan', async ({ page, context }) => {
  // Navigate to marketplace
  await page.goto('https://marketplace.example.com/offers/fastsaas');

  // Select plan
  await page.click('text=Pro Plan');
  await page.click('text=Subscribe');

  // Redirected to landing page
  await page.waitForURL('**/subscriptions/new**');
  await expect(page).toContainText('Complete Your Subscription');

  // Confirm subscription
  await page.click('text=Activate Subscription');

  // Redirected to portal
  await page.waitForURL('**/dashboard');
  await expect(page).toContainText('Welcome to FastSaaS');
});
```

**Test Coverage Target:** 80% line coverage, 100% critical path coverage

### Code Quality

**ESLint Configuration:**
```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-return-types': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

**Security and Multi-Tenancy Test Catalog:**

1. Tenant A cannot read Tenant B subscriptions by id enumeration
2. Tenant A cannot list Tenant B subscriptions by filter tampering
3. Tenant A cannot update Tenant B subscriptions
4. Cache keys include tenant prefix and do not collide across tenants
5. Webhook with valid signature but mismatched tenant subscription is rejected
6. Webhook replay with same event id is idempotent and does not double-charge
7. Webhook with expired timestamp is rejected
8. Audit log query returns only caller tenant records
9. Member role cannot access billing admin endpoints
10. Viewer role cannot trigger manual webhook replay
11. File access URL for Tenant A cannot read Tenant B blob prefix
12. Raw SQL escape hatch fails closed without tenant context

**Security Test Exit Criteria:**
- 100% pass rate for all isolation and idempotency tests
- No high severity findings in API authorization tests
- No critical findings in dependency and container vulnerability scans

**Pre-commit Hooks (Husky):**
```bash
npm run lint       # ESLint
npm run format     # Prettier
npm run test       # Tests
npm run type-check # TypeScript type checking
```

---

## Migration & Upgrade Path

### From Original Accelerator

**Phase 1: Feature Parity** (Months 1-2)
- Port all subscription lifecycle management
- Implement metering APIs
- Replicate webhook handling
- Match database schema

**Phase 2: Enhanced Features** (Months 2-3)
- Add multi-tenancy
- Improved observability
- Advanced billing integration
- Webhooks UI

**Phase 3: Modern DX** (Months 3-4)
- TypeScript SDK
- GraphQL endpoint
- Developer portal
- OpenAPI codegen

**Data Migration Strategy:**
```
1. Create FastSaaS database
2. Export data from .NET version
3. Transform and import (Prisma seed scripts)
4. Run parallel systems (dual-write)
5. Validate data integrity
6. Cutover to FastSaaS
7. Archive old system
```

**Migration Operations Guide (Required Before Cutover):**

1. Dual-write scope and duration
  - Start with subscriptions and metering events only
  - Run dual-write for a minimum of 7 days
  - Compare write success ratio every 15 minutes
2. Divergence detection
  - Trigger divergence incident if record count mismatch exceeds 0.5% for 2 consecutive windows
  - Trigger divergence incident if summed metering quantity mismatch exceeds 0.25%
3. Cutover window
  - Preferred maintenance window: 2 hours
  - Freeze non-critical schema changes 24 hours before cutover
  - Increase on-call staffing for first 24 hours post-cutover
4. Rollback thresholds
  - Rollback if API error rate exceeds 2% for 15 minutes
  - Rollback if p95 latency exceeds 1 second for 15 minutes
  - Rollback if metering submit failure exceeds 1% for 30 minutes
5. Data validation checkpoints
  - Pre-cutover: row counts, checksums, and sampled tenant spot checks
  - Post-cutover: same checks within 1 hour and 24 hours
6. Reconciliation and replay
  - Replay missing metering events from immutable event store
  - Keep old system read-only until reconciliation is complete

### Upgrade Checklist for Existing SaaS

```
Pre-Migration:
☐ Backup all data
☐ Plan rollback procedure
☐ Notify customers of maintenance window
☐ Run migration scripts in staging

Migration:
☐ Run database schema migrations
☐ Execute data transformation
☐ Validate data integrity
☐ Test critical workflows
☐ Update DNS/load balancers
☐ Verify monitoring alerts

Post-Migration:
☐ Monitor error rates closely
☐ Check marketplace webhook delivery
☐ Validate metering submissions
☐ Get customer feedback
☐ Document lessons learned
```

---

## Phase Roadmap

### Phase 1: MVP (Months 1-2)

**Goal:** Deliver a usable and supportable core integration quickly

- ✅ REST API with authentication
- ✅ Subscription lifecycle management
- ✅ Metering & usage tracking
- ✅ Customer portal (basic)
- ✅ Marketplace API integration
- ✅ Docker containerization
- ✅ Single Bicep IaC template
- ✅ Basic monitoring & alerting

**Explicitly Out of Scope for Phase 1:**
- ❌ Multi-tenancy and RLS hardening
- ❌ Publisher portal
- ❌ GraphQL endpoint
- ❌ Kubernetes deployment
- ❌ Advanced RBAC

**Deliverables:**
- GitHub repository (public)
- Docker images in registry
- Bicep template for deployment
- Developer documentation
- Quick-start guide
- API documentation (OpenAPI)

**Implementation Checklist (Phase 1):**

| Work Item | Primary Owner | Definition of Done |
|-----------|---------------|--------------------|
| API foundation and auth middleware | Backend Lead | Authenticated requests pass integration tests and OpenAPI contract checks |
| Subscription lifecycle and fulfill integration | Backend Lead | Subscribe, activate, suspend, and unsubscribe flows pass end-to-end tests |
| Metering ingestion and submission baseline | Backend Lead | Usage events persist, submit to marketplace, and meet initial SLA dashboard checks |
| Customer portal MVP screens | Frontend Lead | Dashboard and settings flows are functional, accessible, and API-integrated |
| Container Apps and Bicep deployment path | DevOps Lead | One-command environment deployment succeeds in staging with documented runbook |
| Monitoring and alert baseline | SRE Lead | Core dashboards and minimum alert set are active with on-call routing validated |

### Phase 1.5: Multi-Tenant Hardening (Months 3-4)

**Goal:** Add tenant isolation and operational safety guarantees

- ✅ Tenant middleware + RLS policy rollout
- ✅ Tenant isolation security test suite
- ✅ Publisher portal (basic)
- ✅ Advanced RBAC and audit logging
- ✅ Marketplace/webhook reliability runbooks
- ✅ Metering SLA dashboards and DLQ tooling

**Deliverables:**
- Security hardening specification
- Multi-tenancy test report
- Updated operations runbooks

**Implementation Checklist (Phase 1.5):**

| Work Item | Primary Owner | Definition of Done |
|-----------|---------------|--------------------|
| Tenant middleware and RLS enforcement rollout | Backend Lead | All tenant-scoped reads and writes are covered by middleware plus RLS verification tests |
| Tenant isolation security test suite execution | Security Lead | Full isolation catalog passes with zero high or critical findings |
| Publisher portal basic workflows | Frontend Lead | Plan and tenant operations complete in portal with RBAC checks enforced |
| RBAC and audit logging hardening | Backend Lead | Permissions matrix behavior matches tests and audit events are immutable and tenant-scoped |
| Webhook and metering runbook validation | SRE Lead | Failure drills completed and recovery playbooks verified in staging |

### Phase 2: Enterprise Ready (Months 4-6)

**Goal:** Production-grade observability, security, and operations

- ✅ OpenTelemetry distributed tracing
- ✅ Event Hubs migration path (if scale trigger reached)
- ✅ Key Vault integration
- ✅ Backup and disaster recovery
- ✅ Multi-region deployment
- ✅ Advanced API rate limiting
- ✅ GraphQL endpoint
- ✅ Webhook management UI
- ✅ Enhanced error handling
- ✅ Performance optimization

**Deliverables:**
- Enterprise deployment guide
- Security best practices guide
- Terraform templates
- Monitoring dashboards (pre-built)
- Helm charts (for Kubernetes)

**Implementation Checklist (Phase 2):**

| Work Item | Primary Owner | Definition of Done |
|-----------|---------------|--------------------|
| OpenTelemetry and distributed tracing | SRE Lead | Cross-service traces are searchable with tenant context and trace sampling policy defined |
| Event transport scale upgrade | Backend Lead | Event Hubs enabled behind feature flag with parity validation against outbox workflow |
| Secret management and backup strategy | DevOps Lead | Key Vault integration and restore drills complete successfully |
| Multi-region readiness | Platform Lead | Failover plan tested with documented recovery time and recovery point objectives |
| Advanced rate limiting and resilience controls | Backend Lead | Tiered throttling and circuit-breaker behaviors pass load and fault-injection tests |
| Enterprise deployment artifacts | DevOps Lead | Terraform and Helm deployment paths validated in non-production environment |

### Phase 3: Developer Experience (Months 7-9)

**Goal:** Best-in-class DX for integrations and extensions

- ✅ TypeScript SDK
- ✅ OpenAPI client generation
- ✅ Developer portal
- ✅ API sandboxes/playgrounds
- ✅ Postman collections
- ✅ VS Code extension
- ✅ Plugin/extension system
- ✅ Webhook management CLI
- ✅ Integration examples (Stripe, etc.)
- ✅ Video tutorials

**Deliverables:**
- NPM SDK package
- Developer portal (web app)
- CLI tool
- Integration samples
- Video walkthrough series
- Community forum

**Implementation Checklist (Phase 3):**

| Work Item | Primary Owner | Definition of Done |
|-----------|---------------|--------------------|
| TypeScript SDK release | SDK Lead | Versioned SDK published with API compatibility tests and migration notes |
| Developer portal and playgrounds | Frontend Lead | Interactive docs and sandbox flows work against staging APIs |
| CLI and automation workflows | Developer Experience Lead | CLI commands for common operations pass integration tests on CI runners |
| Integration examples and templates | Solutions Engineer | Reference integrations run from clean environment using documented steps |
| Education and adoption package | Developer Advocate | Tutorials and videos published with feedback loop instrumented |

### Phase 4: Intelligent Features (Months 10-12)

**Goal:** AI-powered insights and automation

- ✅ Revenue forecasting (ML)
- ✅ Churn prediction
- ✅ Anomaly detection (usage patterns)
- ✅ Smart recommendations
- ✅ Automated billing workflows
- ✅ Natural language reporting
- ✅ Copilot integration

**Deliverables:**
- ML models for predictions
- AI-powered dashboards
- Automated insights emails

**Implementation Checklist (Phase 4):**

| Work Item | Primary Owner | Definition of Done |
|-----------|---------------|--------------------|
| Forecasting and anomaly models | Data Science Lead | Models meet agreed quality thresholds and drift monitoring is enabled |
| AI insights dashboards | Data Product Lead | Dashboards surface explainable signals with tenant-safe filtering |
| Automated workflow actions | Backend Lead | Automation rules are idempotent, auditable, and policy-controlled |
| Natural language reporting | Applied AI Lead | Reports are validated for accuracy and grounded in tenant-scoped data |
| Copilot integration | Platform Lead | Copilot scenarios pass security review and demonstrate measurable operator efficiency |

---

## Success Metrics

### Adoption Metrics
- **Time to Demo Deployment:** <= 15 minutes (pre-provisioned demo path)
- **Time to Production-Ready Deployment:** <= 60 minutes excluding DNS propagation
- **Time to First Successful Fulfillment API Call:** <= 30 minutes from setup start

### Operational Metrics
- **API Availability:** > 99.95%
- **API Latency (p95):** < 200ms
- **Error Rate:** < 0.1%
- **Metering Submission SLA:** 99.9% within 4 hours of event creation
- **Webhook Processing Success:** >= 99.95% within retry policy

### Quality Metrics
- **Test Coverage:** > 80%
- **Security Vulnerabilities:** 0 critical/high
- **Cross-Tenant Isolation Test Pass Rate:** 100%
- **Migration Reconciliation Accuracy:** >= 99.9%

### Production-Ready Exit Criteria

- End-to-end tests pass for subscription, metering, and webhook critical paths
- At least 5 operational dashboards and 15 alert rules are enabled
- On-call schedule and incident runbooks are approved
- Load test validates 10x expected peak traffic without SLA breach
- Security tests confirm no cross-tenant data access paths

---

## Cost Model and TCO Assumptions

This section defines planning assumptions for business and engineering alignment. These are baseline targets to validate during Phase 1.

### Pricing Model Baseline

- Platform fee: fixed monthly fee per publisher environment
- Usage fee: metering event processing fee per million events
- Optional services: premium support and migration assistance
- Marketplace billing remains source of truth for customer usage charges

### Infrastructure Cost Envelope (Azure, monthly)

| Scale Tier | Active Tenants | Estimated Infra Cost | Main Cost Drivers |
|------------|----------------|----------------------|-------------------|
| Small | 1 to 20 | 600 to 1,500 USD | Container Apps baseline, PostgreSQL single zone |
| Medium | 21 to 200 | 1,500 to 6,000 USD | Database compute, worker throughput, log volume |
| Large | 201 to 1,000+ | 7,000 to 30,000+ USD | Multi-region, optional Event Hubs throughput, peak traffic headroom |

### Cost Controls

- Enforce max replica bounds per environment
- Set budget alerts at 70%, 85%, and 100% monthly thresholds
- Review top 5 cost drivers weekly
- Keep default log verbosity at info and gate debug logging behind feature flags
- Archive older audit records to lower-cost storage tiers

### Unit Economics Checkpoints

- Track infrastructure cost per active tenant weekly
- Track infrastructure cost per 10,000 metering events weekly
- Trigger pricing review if gross margin drops below target for 2 consecutive months

---

## Known Risks and Trade-Offs

| Risk | Severity | Mitigation |
|------|----------|------------|
| Prisma + RLS mismatch can create false confidence | High | Enforce tenant middleware, keep RLS enabled, add mandatory isolation tests |
| Marketplace API downtime can delay billing submissions | High | Circuit breaker, DLQ, replay tooling, month-end escalation runbook |
| Shared-database tenancy increases security complexity | High | Hardened tenant controls, scoped cache keys, strict audit policies |
| Dual-write migration can diverge under load | High | Divergence alerts, rollback thresholds, reconciliation scripts |
| Container Apps cost can spike with unbounded scale | Medium | Budget alerts, max replica limits, weekly cost review |

**Trade-Off Summary:**
- We prefer delivery speed in Phase 1 with fixed technology choices and defer optional components
- We keep Prisma for developer velocity while documenting middleware plus RLS requirements
- We use shared-database multi-tenancy for cost efficiency, with explicit hardening work in Phase 1.5

---

## Conclusion

FastSaaS represents a modern approach to SaaS marketplace integration—built on cloud-native principles, TypeScript, and the latest Azure capabilities. By reimagining rather than merely porting the original .NET accelerator, FastSaaS provides a foundation that's not only production-ready but also delightful to develop with.

The phased roadmap ensures we deliver value incrementally, starting with core functionality and building toward enterprise-grade features and superior developer experience.

---

## Appendix: Quick Reference

### Important URLs
- **GitHub:** https://github.com/yourorg/fastsaas
- **Documentation:** https://docs.fastsaas.dev
- **API Reference:** https://api.fastsaas.dev/api/docs
- **Developer Portal:** https://dev.fastsaas.dev

### Key Contacts
- **Product Lead:** product@fastsaas.dev
- **Engineering Lead:** engineering@fastsaas.dev
- **Security:** security@fastsaas.dev

### Related Resources
- [Azure Marketplace Documentation](https://docs.microsoft.com/azure/marketplace/)
- [SaaS Fulfillment APIs](https://docs.microsoft.com/azure/marketplace/partner-center-portal/pc-saas-fulfillment-api-v2)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
