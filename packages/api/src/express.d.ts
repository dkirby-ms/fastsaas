import type { AuthClaims, RequestContext } from '@fastsaas/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      context?: RequestContext;
      correlationId?: string;
    }
  }
}

export {};
