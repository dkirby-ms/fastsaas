import type { ApiResponse, MarketplaceWebhookPayload, Subscription } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import { AppError } from '../../errors/app-error';
import type { ApiRequest } from '../../http';
import { buildResponseMeta } from '../../lib/response';
import type { SubscriptionService } from '../../services/subscription-service';

function parseWebhookBody(body: unknown): MarketplaceWebhookPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw AppError.badRequest('Webhook body must be a JSON object');
  }

  const candidate = body as Record<string, unknown>;
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

export function createMarketplaceWebhookRouter(config: ApiConfig, subscriptionService: SubscriptionService) {
  const router = Router();

  router.post('/marketplace', async (req: ApiRequest, res: Response<ApiResponse<Subscription>>, next) => {
    try {
      const body = parseWebhookBody(req.body);
      const subscription = await subscriptionService.processMarketplaceWebhook({
        ...body,
        requestId: body.requestId ?? String(req.id ?? 'unknown'),
        correlationId: body.correlationId ?? req.correlationId ?? String(req.id ?? 'unknown')
      });

      res.status(202).json({
        status: 'success',
        data: subscription,
        meta: buildResponseMeta(req, config.apiVersion)
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
