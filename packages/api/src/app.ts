import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { createConfig, type ApiConfig } from './config';
import { MarketplaceFulfillmentHttpClient, type MarketplaceFulfillmentClient } from './lib/marketplace-fulfillment';
import { type ApiLogger, logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { correlationContext, createRequestLogger } from './middleware/request-logger';
import { buildOpenApiSpec } from './openapi';
import { healthRouter } from './routes/health';
import { createV1Router } from './routes/v1';
import { createMarketplaceWebhookRouter } from './routes/webhooks/marketplace';
import { InMemorySubscriptionRepository, PrismaSubscriptionRepository, type SubscriptionRepository } from './repositories/subscription-repository';
import { SubscriptionService } from './services/subscription-service';

export interface AppDependencies {
  logger?: ApiLogger;
  subscriptionRepository?: SubscriptionRepository;
  fulfillmentClient?: MarketplaceFulfillmentClient;
  subscriptionService?: SubscriptionService;
}

function createSubscriptionRepository(config: ApiConfig): SubscriptionRepository {
  return config.databaseUrl ? new PrismaSubscriptionRepository() : new InMemorySubscriptionRepository();
}

export function createApp(config: ApiConfig = createConfig(), dependencies: AppDependencies = {}) {
  const app = express();
  const appLogger = dependencies.logger ?? logger;
  const subscriptionRepository = dependencies.subscriptionRepository ?? createSubscriptionRepository(config);
  const fulfillmentClient = dependencies.fulfillmentClient
    ?? new MarketplaceFulfillmentHttpClient({
      baseUrl: config.marketplace.baseUrl,
      apiVersion: config.marketplace.apiVersion,
      authToken: config.marketplace.authToken,
      logger: appLogger
    });
  const subscriptionService = dependencies.subscriptionService
    ?? new SubscriptionService(subscriptionRepository, fulfillmentClient, appLogger);
  const openApiSpec = buildOpenApiSpec(config);

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(createRequestLogger(appLogger));
  app.use(correlationContext);

  app.use(healthRouter);
  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiSpec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));

  app.use('/api/webhooks', createMarketplaceWebhookRouter(config, subscriptionService));
  app.use('/v1', createV1Router(config, subscriptionService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
