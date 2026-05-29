import { Router } from 'express';

import type { ApiConfig } from '../../config';
import { createAuthRouter } from './auth';

export function createV1Router(config: ApiConfig) {
  const router = Router();

  router.use('/auth', createAuthRouter(config));

  return router;
}
