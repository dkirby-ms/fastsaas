import express, { type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';

import { createConfig, type ApiConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import type { MeteringRuntimeDependencies } from './metering/runtime';
import { createMeteringRuntime } from './metering/runtime';
import { requestLogger } from './middleware/request-logger';
import { buildOpenApiSpec } from './openapi';
import { healthRouter } from './routes/health';
import { createPortalRouter } from './routes/portal';
import { createV1Router } from './routes/v1';
import { createMarketplaceWebhookRouter } from './routes/webhooks/marketplace';
import { createAuditLoggingMiddleware, type AuditService } from './services/audit-service';
import type { ProductCatalogService } from './services/product-catalog-service';
import type { JobPollingService } from './services/job-polling-service';
import type { PublisherService } from './services/publisher-service';
import type { SubmissionMonitoringService } from './services/submission-monitoring-service';
import type { SubscriptionService } from './services/subscription-service';
import type { TenantMemberService } from './services/tenant-member-service';
import type { AssetVisibilityService } from './services/asset-visibility-service';
import type { PublisherPlanRepository } from './repositories/publisher-plan-repository';
import type { PlanFeatureGateService } from './services/plan-feature-gate-service';

export interface AppDependencies extends MeteringRuntimeDependencies {
  subscriptionService?: SubscriptionService;
  auditService?: AuditService;
  publisherService?: PublisherService;
  jobPollingService?: JobPollingService;
  productCatalogService?: ProductCatalogService;
  submissionMonitoringService?: SubmissionMonitoringService;
  assetVisibilityService?: AssetVisibilityService;
  tenantMemberService?: TenantMemberService;
  publisherPlanRepository?: PublisherPlanRepository;
  planFeatureGateService?: PlanFeatureGateService;
}

export function createApp(config: ApiConfig = createConfig(), dependencies: AppDependencies = {}) {
  const app = express();
  const openApiSpec = buildOpenApiSpec(config);
  const meteringRuntime = createMeteringRuntime(config, dependencies);

  app.disable('x-powered-by');
  // Azure Container Apps adds one proxy hop; trust the first X-Forwarded-For entry
  app.set('trust proxy', 1);
  app.use(requestLogger);

  if (dependencies.subscriptionService) {
    app.use('/api/webhooks', createMarketplaceWebhookRouter(config, dependencies.subscriptionService));
  }

  app.use(express.json());

  if (dependencies.auditService) {
    app.use(createAuditLoggingMiddleware(dependencies.auditService));
  }

  app.use(healthRouter);

  if (dependencies.subscriptionService && dependencies.publisherPlanRepository) {
    app.use(
      '/portal',
      createPortalRouter(
        config,
        dependencies.subscriptionService,
        dependencies.publisherPlanRepository,
        dependencies.tenantMemberService
      )
    );
  }

  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiSpec);
  });

  const swaggerServeHandlers = swaggerUi.serve as unknown as RequestHandler[];
  const swaggerSetupHandler = swaggerUi.setup(openApiSpec, { explorer: true }) as unknown as RequestHandler;
  app.use('/docs', ...swaggerServeHandlers, swaggerSetupHandler);

  app.use(
    '/v1',
    createV1Router(
      config,
      meteringRuntime.service,
      dependencies.subscriptionService,
      dependencies.auditService,
      dependencies.publisherService,
      dependencies.jobPollingService,
      dependencies.productCatalogService,
      dependencies.submissionMonitoringService,
      dependencies.assetVisibilityService,
      dependencies.tenantMemberService,
      dependencies.planFeatureGateService
    )
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
