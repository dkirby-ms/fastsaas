import type { ApiResponse, MarketplaceWebhookPayload, Subscription } from '@fastsaas/shared';
import express, { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { runWithSystemExecutionContext } from '../../db/execution-context';
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

  /**
   * @swagger
   * /api/webhooks/marketplace:
   *   post:
   *     summary: Process Azure Marketplace subscription webhooks
   *     description: Validates the signed Azure Marketplace webhook payload and applies the requested subscription lifecycle transition.
   *     tags:
   *       - Webhooks
   *     parameters:
   *       - in: header
   *         name: x-ms-marketplace-timestamp
   *         required: true
   *         schema:
   *           type: string
   *         description: Request timestamp used for replay-window validation and signature generation.
   *       - in: header
   *         name: x-ms-marketplace-signature
   *         required: true
   *         schema:
   *           type: string
   *         description: HMAC SHA-256 signature of `<timestamp>.<raw body>` using the configured webhook secret.
   *       - in: header
   *         name: x-ms-marketplace-event-id
   *         required: false
   *         schema:
   *           type: string
   *         description: Optional marketplace event identifier used for idempotency.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [action, marketplaceSubscriptionId]
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [Suspend, Unsubscribe, Reinstate]
   *               marketplaceSubscriptionId:
   *                 type: string
   *               requestId:
   *                 type: string
   *               correlationId:
   *                 type: string
   *               details:
   *                 type: object
   *                 additionalProperties: true
   *     responses:
   *       202:
   *         description: Webhook accepted and applied to the subscription
   *       200:
   *         description: Duplicate or idempotent webhook acknowledged without additional state change
   *       400:
   *         description: Webhook body is invalid
   *       401:
   *         description: Missing or invalid webhook signature or timestamp headers
   *       404:
   *         description: Marketplace subscription not found
   *       409:
   *         description: Subscription cannot transition to the requested status
   */
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
        const result = await runWithSystemExecutionContext(() =>
          subscriptionService.processMarketplaceWebhook({
            ...body,
            idempotencyKey: buildIdempotencyKey(req, body),
            requestId: body.requestId ?? readHeader(req, EVENT_ID_HEADERS) ?? String(req.id ?? 'unknown'),
            correlationId: body.correlationId ?? req.correlationId ?? String(req.id ?? 'unknown')
          })
        );

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
