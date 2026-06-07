import type { NextFunction, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ApiRequest } from '../http';
import { createRequireFeature } from '../middleware/feature-gate';
import type { PlanFeatureGateService } from '../services/plan-feature-gate-service';

function makeMockService(hasFeatureResult: boolean): PlanFeatureGateService {
  return {
    hasFeature: vi.fn().mockResolvedValue(hasFeatureResult),
    listFeaturesForTenant: vi.fn().mockResolvedValue([]),
    listFeatures: vi.fn().mockResolvedValue([]),
    setFeatureGates: vi.fn().mockResolvedValue(undefined),
    removeFeatureGate: vi.fn().mockResolvedValue(undefined)
  };
}

function makeRequest(tenantId: string): ApiRequest {
  return {
    context: { tenantId, requestId: 'test-req', userId: 'user-1', roles: [], scopes: [], jwtRoles: [], roleSource: 'jwt' }
  } as unknown as ApiRequest;
}

function makeNextFn(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('requireFeature middleware', () => {
  it('calls next() without error when the feature is enabled for the tenant plan', async () => {
    const service = makeMockService(true);
    const requireFeature = createRequireFeature(service);
    const req = makeRequest('tenant-a');
    const next = makeNextFn();

    await requireFeature('advanced-analytics')(req, {} as Response, next);

    expect(service.hasFeature).toHaveBeenCalledWith('tenant-a', 'advanced-analytics');
    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next(AppError.forbidden) with upgradeRequired when feature is not in the plan', async () => {
    const service = makeMockService(false);
    const requireFeature = createRequireFeature(service);
    const req = makeRequest('tenant-b');
    const next = makeNextFn();

    await requireFeature('export')(req, {} as Response, next);

    expect(service.hasFeature).toHaveBeenCalledWith('tenant-b', 'export');
    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(403);
    expect(error.details).toMatchObject({ feature: 'export', upgradeRequired: true });
  });

  it('returns 403 with the correct feature key in details', async () => {
    const service = makeMockService(false);
    const requireFeature = createRequireFeature(service);
    const req = makeRequest('tenant-c');
    const next = makeNextFn();

    await requireFeature('sso')(req, {} as Response, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.details?.feature).toBe('sso');
    expect(error.details?.upgradeRequired).toBe(true);
  });

  it('returns 403 when the tenant has no active subscription (hasFeature returns false)', async () => {
    // hasFeature returns false when listByTenant finds no Active subscription
    const service = makeMockService(false);
    const requireFeature = createRequireFeature(service);
    const req = makeRequest('tenant-no-sub');
    const next = makeNextFn();

    await requireFeature('advanced-analytics')(req, {} as Response, next);

    expect(service.hasFeature).toHaveBeenCalledWith('tenant-no-sub', 'advanced-analytics');
    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.details?.upgradeRequired).toBe(true);
  });

  it('different feature keys produce independent gate checks', async () => {
    const service: PlanFeatureGateService = {
      hasFeature: vi.fn().mockImplementation((_tenantId: string, featureKey: string) =>
        Promise.resolve(featureKey === 'allowed-feature')
      ),
      listFeaturesForTenant: vi.fn().mockResolvedValue([]),
      listFeatures: vi.fn().mockResolvedValue([]),
      setFeatureGates: vi.fn().mockResolvedValue(undefined),
      removeFeatureGate: vi.fn().mockResolvedValue(undefined)
    };
    const requireFeature = createRequireFeature(service);
    const req = makeRequest('tenant-d');

    const nextAllowed = makeNextFn();
    await requireFeature('allowed-feature')(req, {} as Response, nextAllowed);
    expect(nextAllowed).toHaveBeenCalledWith();

    const nextDenied = makeNextFn();
    await requireFeature('blocked-feature')(req, {} as Response, nextDenied);
    const error = (nextDenied as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(error.statusCode).toBe(403);
  });
});
