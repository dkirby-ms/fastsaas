import type { ApiResponse } from '@fastsaas/shared';
import type { Response } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

import type { ApiRequest } from '../http';
import { buildResponseMeta } from '../lib/response';

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 100;
const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 10;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createRateLimiter(limit: number): RateLimitRequestHandler {
  const windowMs = parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);

  // NOTE: Uses the default in-memory store. Rate limit counters are per-process
  // and do not synchronize across replicas. When scaling to multiple instances,
  // replace with a shared store (e.g. @rate-limit/redis) to maintain accurate limits.
  return rateLimit({
    windowMs,
    limit,
    legacyHeaders: false,
    standardHeaders: true,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (req: ApiRequest, res: Response<ApiResponse<never>>) => {
      res.status(429).json({
        status: 'error',
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later.'
        },
        meta: buildResponseMeta(req)
      });
    }
  });
}

const apiRateLimitMaxRequests = parsePositiveInteger(
  process.env.RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_API_RATE_LIMIT_MAX_REQUESTS
);
const authRateLimitMaxRequests = parsePositiveInteger(
  process.env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS
);

export const apiLimiter = createRateLimiter(apiRateLimitMaxRequests);
export const authLimiter = createRateLimiter(authRateLimitMaxRequests);
