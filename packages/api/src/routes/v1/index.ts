import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { SubscriptionService } from '../../services/subscription-service';
import { createAuthRouter } from './auth';
import { createSubscriptionsRouter } from './subscriptions';

export function createV1Router(config: ApiConfig, subscriptionService: SubscriptionService) {
  const router = Router();

  router.use('/auth', createAuthRouter(config));
  router.use('/subscriptions', createSubscriptionsRouter(config, subscriptionService));

  return router;
}
