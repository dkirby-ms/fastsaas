import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { createConfig, type ApiConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { buildOpenApiSpec } from './openapi';
import { healthRouter } from './routes/health';
import { createV1Router } from './routes/v1';

export function createApp(config: ApiConfig = createConfig()) {
  const app = express();
  const openApiSpec = buildOpenApiSpec(config);

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(requestLogger);

  app.use(healthRouter);
  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiSpec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));

  app.use('/v1', createV1Router(config));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
