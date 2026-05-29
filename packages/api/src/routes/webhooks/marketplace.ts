import type { ApiResponse, MarketplaceWebhookPayload, Subscription } from '@fastsaas/shared';
import express, { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import { createMarketplaceWebhookAuth } from '../../middleware/marketplace-webhook-auth';
import type { SubscriptionService } from '../../services/subscription-service';

const EVENT_ID_HEADERS = ['x-ms-marketplace-event-id', 'x-ms-event-id', 'x-ms-requestid', 'x-request-id'];
const TIMESTAMP_HEADERS = ['x-ms-marketplace-timestamp', 'x-ms-signature-timestamp', 'x-marketplace-timestamp'];

function readHeader(req: ApiRequest, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.header(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseWebhookBody(body: Buffer): MarketplaceWebhookPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw AppError.badRequest('Webhook body must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw AppError.badRequest('Webhook body must be a JSON object');
  }

  const candidate = parsed as Record<string, unknown>;
  if (!['Suspend', 'Unsubscribe', 'Reinstate'].includes(String(candidate.action))) {
    throw AppError.badRequest('Webhook action must be Suspend, Unsubscribe, or Reinstate');
  }

  if (typeof candidate.marketplaceSubscriptionId !== 'string' || candidate.marketplaceSubscriptionId.length === 0) {
    throw AppError.badRequest('marketplaceSubscriptionId is required');
  }

  if (candidate.details !== undefined && (!candidate.details || typeof candidate.details !== 'object' || Array.isArray(candidate.details))) {
    throw AppError.badRequest('details must be an object when provided');
  }

  return {
    action: candidate.action as MarketplaceWebhookPayload['action'],
    marketplaceSubscriptionId: candidate.marketplaceSubscriptionId,
    requestId: typeof candidate.requestId === 'string' ? candidate.requestId : undefined,
    correlationId: typeof candidate.correlationId === 'string' ? candidate.correlationId : undefined,
    details: candidate.details as Record<string, unknown> | undefined
  };
}

function buildIdempotencyKey(req: ApiRequest, body: MarketplaceWebhookPayload): string {
  const eventId = body.requestId ?? readHeader(req, EVENT_ID_HEADERS);
  if (eventId) {
    return `marketplace:${eventId}`;
  }

  const timestamp = readHeader(req, TIMESTAMP_HEADERS) ?? new Date().toISOString();
  return `marketplace:${body.action}:${body.marketplaceSubscriptionId}:${timestamp}`;
}

export function createMarketplaceWebhookRouter(config: ApiConfig, subscriptionService: SubscriptionService) {
  const router = Router();

  router.post(
    '/marketplace',
    express.raw({ type: 'application/json' }),
    createMarketplaceWebhookAuth(config),
    async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
      try {
        const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;
        if (!rawBody) {
          throw AppError.badRequest('Webhook body is required');
        }

        const body = parseWebhookBody(rawBody);
        const result = await subscriptionService.processMarketplaceWebhook({
          ...body,
          idempotencyKey: buildIdempotencyKey(req, body),
          requestId: body.requestId ?? readHeader(req, EVENT_ID_HEADERS) ?? String(req.id ?? 'unknown'),
          correlationId: body.correlationId ?? req.correlationId ?? String(req.id ?? 'unknown')
        });

        res.status(result.duplicate ? 200 : 202).json({
          status: 'success',
          data: result.subscription,
          meta: buildResponseMeta(req, config.apiVersion)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
