import type { ApiResponse } from '@fastsaas/shared';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { buildResponseMeta } from '../lib/response';

export const notFoundHandler: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req: ApiRequest, res: Response<ApiResponse<never>>, _next: NextFunction): void => {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');

  req.log?.error(
    {
      err: error,
      code: appError.code,
      requestId: req.id,
      correlationId: req.correlationId
    },
    'Request failed'
  );

  res.status(appError.statusCode).json({
    status: 'error',
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details
    },
    meta: buildResponseMeta(req)
  });
};
