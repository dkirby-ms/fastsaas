export class ApiError extends Error {
  constructor(message: string, public status = 500, public code?: string, public userMessage = message) {
    super(message);
    this.name = 'ApiError';
  }
}
