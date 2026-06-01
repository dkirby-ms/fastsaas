import express from 'express';
import type { Logger } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../errors/app-error';
import { MarketplaceFulfillmentError, type MarketplaceFulfillmentClient } from '../lib/marketplace-fulfillment';
import { errorHandler } from '../middleware/error-handler';
import { InMemorySubscriptionRepository } from '../repositories/subscription-repository';
import { SubscriptionService } from '../services/subscription-service';

describe('error response sanitization', () => {
  it('strips AppError details from client-facing responses', async () => {
    const app = express();

    app.get('/fulfillment-failure', (_req, _res, next) => {
      next(
        new AppError(502, 'FULFILLMENT_REQUEST_FAILED', 'Marketplace fulfillment activate request failed', {
          statusCode: 502,
          responseBody: {
            code: 'UpstreamFailure',
            secret: 'do-not-leak'
          }
        })
      );
    });
    app.use(errorHandler);

    const response = await request(app).get('/fulfillment-failure');

    expect(response.status).toBe(502);
    expect(response.body.error).toEqual({
      code: 'FULFILLMENT_REQUEST_FAILED',
      message: 'Marketplace fulfillment activate request failed'
    });
    expect(response.body.error).not.toHaveProperty('details');
  });

  it('logs upstream fulfillment bodies server-side without preserving them on AppError', async () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    } as unknown as Logger;
    const upstreamBody = {
      code: 'PartnerCenterFailure',
      detail: 'sensitive upstream payload'
    };
    const fulfillmentClient: MarketplaceFulfillmentClient = {
      async resolveSubscription() {
        return {
          marketplaceSubscriptionId: 'marketplace-sub-123',
          planId: 'basic',
          quantity: 5,
          purchaserTenantId: 'purchaser-tenant-123',
          beneficiaryTenantId: 'tenant-123'
        };
      },
      async activateSubscription() {
        throw new MarketplaceFulfillmentError('Upstream activation failed', 'activate', 502, upstreamBody);
      },
      async suspendSubscription() {},
      async unsubscribeSubscription() {},
      async updateSubscription() {},
      async reinstateSubscription() {},
      async getOperation() {
        throw new Error('getOperation should not be called');
      },
      async updateOperationStatus() {
        throw new Error('updateOperationStatus should not be called');
      }
    };
    const repository = new InMemorySubscriptionRepository();
    const service = new SubscriptionService(repository, fulfillmentClient, logger);
    const subscription = await service.subscribe({
      tenantId: 'tenant-123',
      userId: 'user-123',
      marketplaceToken: 'marketplace-token-123',
      requestId: 'req-123',
      correlationId: 'corr-123',
      source: 'api'
    });

    let thrownError: unknown;

    try {
      await service.activateSubscription({
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        requestId: 'req-456',
        correlationId: 'corr-456',
        source: 'api'
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError).toMatchObject({
      statusCode: 502,
      code: 'FULFILLMENT_REQUEST_FAILED',
      message: 'Marketplace fulfillment activate request failed'
    });
    expect((thrownError as AppError).details).toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'activate',
        requestId: 'req-456',
        correlationId: 'corr-456',
        subscriptionId: subscription.id,
        marketplaceSubscriptionId: subscription.marketplaceSubscriptionId,
        statusCode: 502,
        responseBody: upstreamBody,
        err: expect.any(MarketplaceFulfillmentError)
      }),
      'Marketplace fulfillment request failed'
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
