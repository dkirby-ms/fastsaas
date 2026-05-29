import type { ApiResponseMeta } from '@fastsaas/shared';

import type { ApiRequest } from '../http';

export function buildResponseMeta(req: ApiRequest, version = 'v1'): ApiResponseMeta {
  return {
    requestId: String(req.id ?? 'unknown'),
    correlationId: req.correlationId,
    timestamp: new Date().toISOString(),
    version
  };
}
