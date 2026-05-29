import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { MeteringService } from '../../metering/service';
import type { SubscriptionService } from '../../services/subscription-service';
import { createAuthRouter } from './auth';
import { createMeteringRouter } from './metering';
import { createSubscriptionsRouter } from './subscriptions';

export function createV1Router(config: ApiConfig, meteringService: MeteringService, subscriptionService?: SubscriptionService) {
  const router = Router();

  router.use('/auth', createAuthRouter(config));
  router.use('/metering', createMeteringRouter(config, meteringService));

  if (subscriptionService) {
    router.use('/subscriptions', createSubscriptionsRouter(config, subscriptionService));
  }

  return router;
}
