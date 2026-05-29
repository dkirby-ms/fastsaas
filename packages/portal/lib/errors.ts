export class ApiError extends Error {
  constructor(message: string, public status = 500, public code?: string, public userMessage = message) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.userMessage;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
