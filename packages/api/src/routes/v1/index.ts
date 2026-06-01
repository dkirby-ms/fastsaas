import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { MeteringService } from '../../metering/service';
import type { AuditService } from '../../services/audit-service';
import type { PublisherService } from '../../services/publisher-service';
import type { SubscriptionService } from '../../services/subscription-service';
import { createAuditLogsRouter } from './audit-logs';
import { createAuthRouter } from './auth';
import { createMeteringRouter } from './metering';
import { createPublisherRouter } from './publisher';
import { createSubscriptionsRouter } from './subscriptions';

export function createV1Router(
  config: ApiConfig,
  meteringService: MeteringService,
  subscriptionService?: SubscriptionService,
  auditService?: AuditService,
  publisherService?: PublisherService
) {
  const router = Router();

  router.use('/auth', createAuthRouter(config));
  router.use('/metering', createMeteringRouter(config, meteringService));

  if (subscriptionService) {
    router.use('/subscriptions', createSubscriptionsRouter(config, subscriptionService));
  }

  if (auditService) {
    router.use('/audit-logs', createAuditLogsRouter(config, auditService));
  }

  if (publisherService) {
    router.use('/publisher', createPublisherRouter(config, publisherService));
  }

  return router;
}
