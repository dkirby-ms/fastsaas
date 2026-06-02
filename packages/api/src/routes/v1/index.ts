import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { MeteringService } from '../../metering/service';
import type { AuditService } from '../../services/audit-service';
import type { JobPollingService } from '../../services/job-polling-service';
import type { PartnerCenterService } from '../../services/partner-center-service';
import type { ProductCatalogService } from '../../services/product-catalog-service';
import type { PublisherService } from '../../services/publisher-service';
import type { SubscriptionService } from '../../services/subscription-service';
import type { TenantMemberService } from '../../services/tenant-member-service';
import { createAuditLogsRouter } from './audit-logs';
import { createAuthRouter } from './auth';
import { createMembersRouter } from './members';
import { createMeteringRouter } from './metering';
import { createPublisherRouter } from './publisher';
import { createSubscriptionsRouter } from './subscriptions';

export function createV1Router(
  config: ApiConfig,
  meteringService: MeteringService,
  subscriptionService?: SubscriptionService,
  auditService?: AuditService,
  publisherService?: PublisherService,
  partnerCenterService?: PartnerCenterService,
  jobPollingService?: JobPollingService,
  productCatalogService?: ProductCatalogService,
  tenantMemberService?: TenantMemberService
) {
  const router = Router();

  router.use('/auth', createAuthRouter(config, tenantMemberService));
  router.use('/metering', createMeteringRouter(config, meteringService, tenantMemberService));

  if (subscriptionService) {
    router.use('/subscriptions', createSubscriptionsRouter(config, subscriptionService, tenantMemberService));
  }

  if (tenantMemberService) {
    router.use('/members', createMembersRouter(config, tenantMemberService));
  }

  if (auditService) {
    router.use('/audit-logs', createAuditLogsRouter(config, auditService, tenantMemberService));
  }

  if (publisherService && partnerCenterService && jobPollingService) {
    router.use('/publisher', createPublisherRouter(config, publisherService, partnerCenterService, jobPollingService, productCatalogService, tenantMemberService));
  }

  return router;
}
