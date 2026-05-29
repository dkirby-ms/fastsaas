export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'The request is invalid', details?: Record<string, unknown>): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication is required', details?: Record<string, unknown>): AppError {
    return new AppError(401, 'AUTH_UNAUTHORIZED', message, details);
  }

  static forbidden(message = 'You do not have access to this resource', details?: Record<string, unknown>): AppError {
    return new AppError(403, 'AUTH_FORBIDDEN', message, details);
  }

  static notFound(message = 'The requested resource was not found', details?: Record<string, unknown>): AppError {
    return new AppError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message = 'The requested change conflicts with the current resource state', details?: Record<string, unknown>): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static serviceUnavailable(message = 'A dependent service is unavailable', details?: Record<string, unknown>): AppError {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}
