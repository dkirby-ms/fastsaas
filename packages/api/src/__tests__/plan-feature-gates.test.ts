/**
 * Unit tests for PlanFeatureGateService.
 *
 * All tests are marked `it.todo` pending EECOM's implementation.
 * When `PlanFeatureGateService` lands, uncomment the import and
 * replace each `it.todo` with a full test body using the helper
 * factories below.
 *
 * Expected module path: ../services/plan-feature-gate-service
 *
 * DB table: plan_feature_gates
 *   Columns: publisher_tenant_id, plan_id, feature_key, enabled, metadata, created_at
 *   PK:      (publisher_tenant_id, plan_id, feature_key)
 */

// TODO(EECOM): Uncomment when implementation is ready
// import { DefaultPlanFeatureGateService } from '../services/plan-feature-gate-service';

import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type {
  PlanFeatureGateRepository,
  StoredFeatureGate,
  UpsertFeatureGateInput
} from '../repositories/plan-feature-gate-repository';
import type { SubscriptionRepository } from '../repositories/subscription-repository';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function createMockGateRepository(
  overrides: Partial<PlanFeatureGateRepository> = {}
): PlanFeatureGateRepository {
  return {
    listByPlan: vi.fn().mockResolvedValue([]),
    findEnabledByPlanAndKey: vi.fn().mockResolvedValue(null),
    upsertMany: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createMockSubscriptionRepository(
  overrides: Partial<SubscriptionRepository> = {}
): SubscriptionRepository {
  return {
    createSubscription: vi.fn(),
    createManagedSubscription: vi.fn(),
    updateManagedSubscription: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByMarketplaceSubscriptionId: vi.fn().mockResolvedValue(null),
    findWebhookEventByIdempotencyKey: vi.fn().mockResolvedValue(null),
    listByTenant: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    startWebhookEventProcessing: vi.fn().mockResolvedValue(false),
    transitionSubscription: vi.fn(),
    recordWebhookEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
}

function makeStoredGate(overrides: Partial<StoredFeatureGate> = {}): StoredFeatureGate {
  return {
    publisherTenantId: 'publisher-tenant-a',
    planId: 'plan-pro',
    featureKey: 'advanced-analytics',
    enabled: true,
    metadata: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Service: hasFeature
// ---------------------------------------------------------------------------

describe('PlanFeatureGateService.hasFeature', () => {
  it.todo(
    'returns true when the feature is enabled on the tenant\'s active plan — ' +
      'setup: subscriptionRepository.listByTenant returns a subscription with status=Active and planId="plan-pro", ' +
      'featureGateRepository.findEnabledByPlanAndKey returns a gate with enabled=true; ' +
      'assert: hasFeature("publisher-tenant-a", "advanced-analytics") resolves to true'
  );

  it.todo(
    'returns false when the feature key does not exist in plan_feature_gates — ' +
      'setup: subscriptionRepository.listByTenant returns an active subscription, ' +
      'featureGateRepository.findEnabledByPlanAndKey returns null; ' +
      'assert: hasFeature resolves to false'
  );

  it.todo(
    'returns false when the feature row exists but enabled=false — ' +
      'setup: featureGateRepository.findEnabledByPlanAndKey returns null (only returns enabled gates); ' +
      'assert: hasFeature resolves to false'
  );

  it.todo(
    'returns false when the tenant has no active subscription — ' +
      'setup: subscriptionRepository.listByTenant returns [] (no active subscription); ' +
      'assert: hasFeature resolves to false without calling findEnabledByPlanAndKey'
  );
});

// ---------------------------------------------------------------------------
// Service: listFeatures
// ---------------------------------------------------------------------------

describe('PlanFeatureGateService.listFeatures', () => {
  it.todo(
    'returns only the keys of enabled gates for a given plan — ' +
      'setup: featureGateRepository.listByPlan returns [enabled=true, enabled=false, enabled=true]; ' +
      'assert: result equals ["feature-a", "feature-c"] (disabled key omitted)'
  );

  it.todo(
    'returns an empty array when no gates are configured for the plan — ' +
      'setup: featureGateRepository.listByPlan returns []; ' +
      'assert: result resolves to []'
  );
});

// ---------------------------------------------------------------------------
// Service: setFeatureGates
// ---------------------------------------------------------------------------

describe('PlanFeatureGateService.setFeatureGates', () => {
  it.todo(
    'creates new gates when none exist — ' +
      'setup: pass three new gates to setFeatureGates; ' +
      'assert: featureGateRepository.upsertMany is called once with the correct payload and resolves without error'
  );

  it.todo(
    'updates (upserts) an existing gate when called with the same feature key — ' +
      'setup: call setFeatureGates twice for the same tenantId/planId/featureKey pair, ' +
      'second call changes enabled from true to false; ' +
      'assert: featureGateRepository.upsertMany is called both times and the second call carries enabled=false'
  );

  it.todo(
    'does not error and does not call featureGateRepository.upsertMany with empty gates array — ' +
      'setup: call setFeatureGates with gates=[]; ' +
      'assert: resolves without error; featureGateRepository.upsertMany is either not called or called with []'
  );
});

// ---------------------------------------------------------------------------
// Service: removeFeatureGate
// ---------------------------------------------------------------------------

describe('PlanFeatureGateService.removeFeatureGate', () => {
  it.todo(
    'deletes the specified gate from the repository — ' +
      'setup: call removeFeatureGate("publisher-tenant-a", "plan-pro", "advanced-analytics"); ' +
      'assert: featureGateRepository.remove is called with the exact (tenantId, planId, featureKey) triple'
  );

  it.todo(
    'resolves without error when the gate does not exist (idempotent delete) — ' +
      'setup: featureGateRepository.remove resolves without rows affected; ' +
      'assert: removeFeatureGate still resolves to void with no exception thrown'
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('PlanFeatureGateService — edge cases', () => {
  it.todo(
    'hasFeature returns false for a wrong tenant ID even when the feature exists on another tenant (RLS isolation) — ' +
      'setup: seed a gate row for publisher-tenant-A/plan-pro/feature-x; ' +
      'call hasFeature with publisher-tenant-B; ' +
      'assert: subscriptionRepository.listByTenant is called with publisher-tenant-B (not A) and the result is false'
  );

  it.todo(
    'two different plans can each define the same feature key independently — ' +
      'setup: gate rows exist for (plan-basic, "export") enabled=false and (plan-pro, "export") enabled=true; ' +
      'assert: listFeatures("plan-basic", ...) omits "export"; listFeatures("plan-pro", ...) includes "export"'
  );

  it.todo(
    'metadata field stores and retrieves arbitrary JSON correctly — ' +
      'setup: call setFeatureGates with metadata={ maxRequests: 1000, tier: "gold" }; ' +
      'assert: featureGateRepository.upsertMany receives the metadata object unchanged; ' +
      'featureGateRepository.listByPlan returns the same metadata value without truncation or coercion'
  );
});

// ---------------------------------------------------------------------------
// API routes (publisher-facing)
// ---------------------------------------------------------------------------

describe('GET /v1/publisher/plans/:planId/features', () => {
  it.todo(
    'returns 200 with the list of enabled feature keys for a plan — ' +
      'setup: mock service.listFeatures to return ["export", "sso"]; ' +
      'assert: response body contains { data: ["export", "sso"] }'
  );

  it.todo(
    'returns 401 for unauthenticated requests'
  );

  it.todo(
    'returns 403 when the requesting tenant does not own the plan'
  );
});

describe('PUT /v1/publisher/plans/:planId/features', () => {
  it.todo(
    'returns 200 after bulk-setting feature gates — ' +
      'setup: send a valid gates array in the request body; ' +
      'assert: service.setFeatureGates is called and the response is 200'
  );

  it.todo(
    'returns 400 when the request body is missing or malformed'
  );

  it.todo(
    'returns 401 for unauthenticated requests'
  );
});

describe('DELETE /v1/publisher/plans/:planId/features/:featureKey', () => {
  it.todo(
    'returns 204 after successfully removing a feature gate'
  );

  it.todo(
    'returns 204 when the feature gate did not exist (idempotent)'
  );

  it.todo(
    'returns 401 for unauthenticated requests'
  );
});

// ---------------------------------------------------------------------------
// API routes (customer-facing)
// ---------------------------------------------------------------------------

describe('GET /v1/features/:featureKey', () => {
  it.todo(
    'returns 200 { enabled: true } when the tenant\'s active plan has the feature — ' +
      'setup: mock service.hasFeature to return true; ' +
      'assert: response body is { data: { enabled: true } }'
  );

  it.todo(
    'returns 200 { enabled: false } when the feature is disabled or absent'
  );

  it.todo(
    'returns 401 for unauthenticated requests'
  );
});
