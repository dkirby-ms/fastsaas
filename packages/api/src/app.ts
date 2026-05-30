import express, { type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';

import { createConfig, type ApiConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import type { MeteringRuntimeDependencies } from './metering/runtime';
import { createMeteringRuntime } from './metering/runtime';
import { requestLogger } from './middleware/request-logger';
import { buildOpenApiSpec } from './openapi';
import { healthRouter } from './routes/health';
import { createV1Router } from './routes/v1';
import { createMarketplaceWebhookRouter } from './routes/webhooks/marketplace';
import type { SubscriptionService } from './services/subscription-service';

export interface AppDependencies extends MeteringRuntimeDependencies {
  subscriptionService?: SubscriptionService;
}

export function createApp(config: ApiConfig = createConfig(), dependencies: AppDependencies = {}) {
  const app = express();
  const openApiSpec = buildOpenApiSpec(config);
  const meteringRuntime = createMeteringRuntime(config, dependencies);

  app.disable('x-powered-by');
  app.use(requestLogger);

  if (dependencies.subscriptionService) {
    app.use('/api/webhooks', createMarketplaceWebhookRouter(config, dependencies.subscriptionService));
  }

  app.use(express.json());

  app.use(healthRouter);
  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiSpec);
  });

  const swaggerServeHandlers = swaggerUi.serve as unknown as RequestHandler[];
  const swaggerSetupHandler = swaggerUi.setup(openApiSpec, { explorer: true }) as unknown as RequestHandler;
  app.use('/docs', ...swaggerServeHandlers, swaggerSetupHandler);

  app.use('/v1', createV1Router(config, meteringRuntime.service, dependencies.subscriptionService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
