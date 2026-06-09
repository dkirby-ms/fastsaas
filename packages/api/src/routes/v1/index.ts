import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { MeteringService } from '../../metering/service';
import type { AuditService } from '../../services/audit-service';
import type { JobPollingService } from '../../services/job-polling-service';
import type { PlanFeatureGateService } from '../../services/plan-feature-gate-service';
import type { ProductCatalogService } from '../../services/product-catalog-service';
import type { PublisherService } from '../../services/publisher-service';
import type { SubmissionMonitoringService } from '../../services/submission-monitoring-service';
import type { SubscriptionService } from '../../services/subscription-service';
import type { TenantMemberService } from '../../services/tenant-member-service';
import type { AssetVisibilityService } from '../../services/asset-visibility-service';
import { createAuditLogsRouter } from './audit-logs';
import { createAuthRouter } from './auth';
import { createFeaturesRouter } from './features';
import { createMembersRouter } from './members';
import { createMeteringRouter } from './metering';
import { createOperatorRouter } from './operator';
import { createSubscriptionsRouter } from './subscriptions';

export function createV1Router(
  config: ApiConfig,
  meteringService: MeteringService,
  subscriptionService?: SubscriptionService,
  auditService?: AuditService,
  publisherService?: PublisherService,
  jobPollingService?: JobPollingService,
  productCatalogService?: ProductCatalogService,
  submissionMonitoringService?: SubmissionMonitoringService,
  assetVisibilityService?: AssetVisibilityService,
  tenantMemberService?: TenantMemberService,
  planFeatureGateService?: PlanFeatureGateService
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

  if (planFeatureGateService) {
    router.use('/features', createFeaturesRouter(config, planFeatureGateService, tenantMemberService));
  }

  if (publisherService && jobPollingService) {
    router.use(
      '/operator',
      createOperatorRouter(
        config,
        publisherService,
        jobPollingService,
        productCatalogService,
        submissionMonitoringService,
        assetVisibilityService,
        tenantMemberService,
        planFeatureGateService
      )
    );
  }

  return router;
}
