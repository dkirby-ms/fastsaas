const REDACTED_MARKETPLACE_TOKEN = '[REDACTED]';
const SENSITIVE_MARKETPLACE_TOKEN_KEYS = new Set(['marketplacetoken', 'marketplacepurchasetoken']);

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCreateSubscriptionAudit(metadata?: Record<string, unknown>): boolean {
  const method = typeof metadata?.method === 'string' ? metadata.method.toUpperCase() : undefined;
  const path = typeof metadata?.path === 'string' ? metadata.path.split('?')[0]?.replace(/\/$/, '') : undefined;
  return method === 'POST' && path === '/v1/subscriptions';
}

export function redactMarketplaceTokens<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactMarketplaceTokens(item)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_MARKETPLACE_TOKEN_KEYS.has(normalizeKey(key))) {
        return [key, REDACTED_MARKETPLACE_TOKEN];
      }

      return [key, redactMarketplaceTokens(entryValue)];
    })
  ) as T;
}

export function redactMarketplaceAuditResourceId(
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): string | undefined {
  if (!resourceId) {
    return resourceId;
  }

  if (resource === 'subscriptions' && isCreateSubscriptionAudit(metadata)) {
    return REDACTED_MARKETPLACE_TOKEN;
  }

  return resourceId;
}

export { REDACTED_MARKETPLACE_TOKEN };
