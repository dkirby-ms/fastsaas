import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';

import type { ApiLogger } from '../lib/logger';
import { logger } from '../lib/logger';
import type { ApiRequest } from '../http';

export function createRequestLogger(appLogger: ApiLogger) {
  return pinoHttp({
    logger: appLogger,
    genReqId: (req, res) => {
      const headerValue = req.headers['x-request-id'];
      const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue ?? randomUUID();
      res.setHeader('x-request-id', requestId);
      return requestId;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) {
        return 'error';
      }

      if (res.statusCode >= 400) {
        return 'warn';
      }

      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        correlationId: (req as ApiRequest).correlationId
      }),
      res: (res) => ({
        statusCode: res.statusCode
      })
    }
  });
}

export const requestLogger = createRequestLogger(logger);

export const correlationContext: RequestHandler = (req: ApiRequest, res, next) => {
  const correlationHeader = req.header('x-correlation-id') ?? req.header('x-ms-requestid');
  req.correlationId = correlationHeader ?? String(req.id ?? randomUUID());
  res.setHeader('x-correlation-id', req.correlationId);
  next();
};
