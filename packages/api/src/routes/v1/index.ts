import { Router } from 'express';

import type { ApiConfig } from '../../config';
import type { MeteringService } from '../../metering/service';
import { createAuthRouter } from './auth';
import { createMeteringRouter } from './metering';

export function createV1Router(config: ApiConfig, meteringService: MeteringService) {
  const router = Router();

  router.use('/auth', createAuthRouter(config));
  router.use('/metering', createMeteringRouter(config, meteringService));

  return router;
}