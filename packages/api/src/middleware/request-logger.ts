import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';

import { logger } from '../lib/logger';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function sanitizeRequestId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 128 || !REQUEST_ID_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const headerValue = req.headers['x-request-id'];
    const rawRequestId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const requestId = sanitizeRequestId(rawRequestId) ?? randomUUID();
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
      url: req.url
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
});
