import type { AuthClaims, RequestContext } from '@fastsaas/shared';

import type { RequestAuditContext } from './services/audit-service';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      context?: RequestContext;
      correlationId?: string;
      audit?: RequestAuditContext;
    }
  }
}

export {};
