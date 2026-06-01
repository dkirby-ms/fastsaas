import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { AuditLogEntry, AuditLogOutcome, AuditLogRepository } from '../repositories/audit-log-repository';
import type { RbacAction, RbacResource } from '../middleware/rbac';
import { redactMarketplaceAuditResourceId, redactMarketplaceTokens } from '../lib/marketplace-token-redaction';

export interface RequestAuditContext {
  action: RbacAction;
  resource: RbacResource;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface RecordAuditEventInput {
  tenantId: string;
  actorId: string;
  action: RbacAction;
  resource: RbacResource;
  resourceId?: string;
  outcome: AuditLogOutcome;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

function resolveOutcome(statusCode: number): AuditLogOutcome {
  if (statusCode >= 200 && statusCode < 400) {
    return 'success';
  }

  if (statusCode === 403) {
    return 'denied';
  }

  return 'failure';
}

function sanitizeAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  const metadata = redactMarketplaceTokens(entry.metadata);

  return {
    ...entry,
    resourceId: redactMarketplaceAuditResourceId(entry.resource, entry.resourceId, metadata),
    metadata
  };
}

export class AuditService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly logger: Logger
  ) {}

  async record(input: RecordAuditEventInput): Promise<AuditLogEntry> {
    const metadata = redactMarketplaceTokens(input.metadata ?? {});

    return sanitizeAuditEntry(
      await this.repository.append({
        id: randomUUID(),
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        resourceId: redactMarketplaceAuditResourceId(input.resource, input.resourceId, metadata),
        timestamp: input.timestamp ?? new Date().toISOString(),
        outcome: input.outcome,
        metadata
      })
    );
  }

  async listByTenant(tenantId: string): Promise<AuditLogEntry[]> {
    return (await this.repository.listByTenant(tenantId)).map((entry) => sanitizeAuditEntry(entry));
  }
}

export function createAuditLoggingMiddleware(auditService: AuditService): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const audit = req.audit;
      const context = req.context;

      if (!audit || !context) {
        return;
      }

      void auditService
        .record({
          tenantId: context.tenantId,
          actorId: context.userId,
          action: audit.action,
          resource: audit.resource,
          resourceId: audit.resourceId,
          outcome: resolveOutcome(res.statusCode),
          metadata: {
            ...(audit.metadata ?? {}),
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            requestId: String(req.id ?? context.requestId),
            correlationId: req.correlationId,
            roles: context.roles
          }
        })
        .catch((error) => {
          req.log?.error({ err: error, requestId: req.id, correlationId: req.correlationId }, 'Failed to persist audit log');
        });
    });

    next();
  };
}

export async function waitForAuditLogFlush(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
