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
const SUPPORTED_ACTIONS = ['Suspend', 'Unsubscribe', 'Reinstate', 'ChangePlan', 'ChangeQuantity', 'Transfer'] as const;

function readHeader(req: ApiRequest, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.header(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw AppError.badRequest(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readString(value, fieldName);
}

function readOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw AppError.badRequest(`${fieldName} must be a number when provided`);
  }

  return value;
}

function parseWebhookBody(body: Buffer): MarketplaceWebhookPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw AppError.badRequest('Webhook body must be valid JSON');
  }

  if (!isRecord(parsed)) {
    throw AppError.badRequest('Webhook body must be a JSON object');
  }

  const candidate = parsed;
  const action = readString(candidate.action, 'action') as MarketplaceWebhookPayload['action'];
  if (!SUPPORTED_ACTIONS.includes(action)) {
    throw AppError.badRequest(`Webhook action must be ${SUPPORTED_ACTIONS.join(', ')}`);
  }

  const subscription = isRecord(candidate.subscription) ? candidate.subscription : undefined;
  const beneficiary = subscription && isRecord(subscription.beneficiary) ? subscription.beneficiary : undefined;
  const details = candidate.details === undefined ? undefined : isRecord(candidate.details) ? candidate.details : null;
  if (details === null) {
    throw AppError.badRequest('details must be an object when provided');
  }

  return {
    action,
    marketplaceSubscriptionId: readString(candidate.marketplaceSubscriptionId ?? candidate.subscriptionId, 'marketplaceSubscriptionId'),
    operationId: readOptionalString(candidate.operationId ?? candidate.id, 'operationId'),
    planId: readOptionalString(candidate.planId, 'planId'),
    quantity: readOptionalNumber(candidate.quantity, 'quantity'),
    beneficiaryTenantId: readOptionalString(
      candidate.beneficiaryTenantId ?? candidate.tenantId ?? beneficiary?.tenantId,
      'beneficiaryTenantId'
    ),
    requestId: readOptionalString(candidate.requestId ?? candidate.activityId, 'requestId'),
    correlationId: readOptionalString(candidate.correlationId ?? candidate.activityId, 'correlationId'),
    details: details ?? undefined
  };
}

function buildIdempotencyKey(req: ApiRequest, body: MarketplaceWebhookPayload): string {
  const eventId = body.operationId ?? body.requestId ?? readHeader(req, EVENT_ID_HEADERS);
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
   *     description: Applies the requested subscription lifecycle transition. When webhook signature headers are present, the API validates them with the configured webhook secret; otherwise callback mode requires a Microsoft Entra Bearer token whose issuer, audience, signature, and expiry are validated before the webhook is processed.
   *     tags:
   *       - Webhooks
   *     parameters:
   *       - in: header
   *         name: x-ms-marketplace-timestamp
   *         required: false
   *         schema:
   *           type: string
   *         description: Optional request timestamp used for replay-window validation and signature generation when Partner Center webhook signing is enabled.
   *       - in: header
   *         name: x-ms-marketplace-signature
   *         required: false
   *         schema:
   *           type: string
   *         description: Optional HMAC SHA-256 signature of `<timestamp>.<raw body>` using the configured webhook secret when Partner Center webhook signing is enabled.
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
   *             required: [action]
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [Suspend, Unsubscribe, Reinstate, ChangePlan, ChangeQuantity, Transfer]
   *               marketplaceSubscriptionId:
   *                 type: string
   *               subscriptionId:
   *                 type: string
   *                 description: Azure Marketplace SaaS subscription identifier. Accepted as an alias of marketplaceSubscriptionId.
   *               operationId:
   *                 type: string
   *               id:
   *                 type: string
   *                 description: Marketplace operation identifier. Accepted as an alias of operationId.
   *               planId:
   *                 type: string
   *               quantity:
   *                 type: number
   *               beneficiaryTenantId:
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
   *         description: Invalid signed webhook headers when strict HMAC auth is enabled or when a partially signed request is received
   *       404:
   *         description: Marketplace subscription not found
   *       409:
   *         description: Subscription cannot apply the requested marketplace change
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
