export type MarketplaceWebhookAuthMode = 'hmac' | 'callback' | 'none';

export interface ApiConfig {
  port: number;
  apiVersion: string;
  databaseUrl?: string;
  auth: {
    issuer: string;
    audience: string[];
    jwksUri: string;
    azureTenantId: string;
    azureClientId: string;
    requiredScope: string;
    tenantClaimKeys: string[];
    userClaimKeys: string[];
    bypassEnabled: boolean;
    devUserId: string;
    devTenantId: string;
  };
  marketplace: {
    baseUrl: string;
    apiVersion: string;
    clientId: string;
    tenantId: string;
    clientSecret: string;
    tokenScope: string;
    productIngestionBaseUrl: string;
    webhookSecret: string;
    webhookAuthMode: MarketplaceWebhookAuthMode;
    webhookTimestampToleranceMs: number;
  };
  database: {
    url?: string;
  };
  metering: {
    readScope: string;
    writeScope: string;
    batchSize: number;
    workerIntervalMs: number;
    claimLeaseMs: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
    retryJitterRatio: number;
    maxRetries: number;
    submissionSlaMs: number;
    marketplaceEndpoint?: string;
  };
  jobPolling: {
    batchSize: number;
    workerIntervalMs: number;
    pollBaseDelayMs: number;
    pollMaxDelayMs: number;
    pollJitterRatio: number;
    maxPollDurationMs: number;
  };
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function parseAudiences(rawAudience: string | undefined, clientId: string): string[] {
  if (rawAudience) {
    return rawAudience
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [clientId, `api://${clientId}`];
}

function isMultiTenantAuthority(tenantId: string): boolean {
  return tenantId === 'common' || tenantId === 'organizations';
}

function isLocalEnvironment(nodeEnv: string): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test';
}

function parseMarketplaceWebhookAuthMode(value: string | undefined): MarketplaceWebhookAuthMode {
  const normalized = value?.trim().toLowerCase() ?? 'callback';

  switch (normalized) {
    case 'hmac':
    case 'callback':
    case 'none':
      return normalized;
    default:
      throw new Error('MARKETPLACE_WEBHOOK_AUTH_MODE must be one of: hmac, callback, none');
  }
}

function resolveMarketplaceSecrets(env: NodeJS.ProcessEnv, nodeEnv: string): {
  clientSecret: string;
  webhookSecret: string;
} {
  // MARKETPLACE_CLIENT_SECRET is shared across marketplace integrations.
  // Product Ingestion uses it as the OAuth client_secret while fulfillment keeps its direct bearer behavior.
  const clientSecret = env.MARKETPLACE_CLIENT_SECRET?.trim();
  const webhookSecret = env.MARKETPLACE_WEBHOOK_SECRET?.trim();

  if (isLocalEnvironment(nodeEnv)) {
    return {
      clientSecret: clientSecret || 'local-marketplace-client-secret',
      webhookSecret: webhookSecret || 'local-marketplace-webhook-secret'
    };
  }

  const missingSecrets = [
    !clientSecret ? 'MARKETPLACE_CLIENT_SECRET' : undefined,
    !webhookSecret ? 'MARKETPLACE_WEBHOOK_SECRET' : undefined
  ].filter((value): value is string => Boolean(value));

  if (missingSecrets.length > 0) {
    throw new Error(
      `Missing required marketplace secrets for NODE_ENV=${nodeEnv}: ${missingSecrets.join(', ')}. ` +
        'Fallback values are only allowed in development and test environments.'
    );
  }

  return {
    clientSecret: clientSecret as string,
    webhookSecret: webhookSecret as string
  };
}

export function createConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const bypassEnabled = env.AUTH_BYPASS_ENABLED === 'true';
  const azureTenantId = env.ENTRA_TENANT_ID?.trim();
  const azureClientId = env.ENTRA_CLIENT_ID?.trim();

  if (bypassEnabled && nodeEnv === 'production') {
    throw new Error('AUTH_BYPASS_ENABLED cannot be enabled in production');
  }

  if (!bypassEnabled && !azureClientId) {
    throw new Error('ENTRA_CLIENT_ID is required when auth bypass is disabled');
  }

  const resolvedTenantId = azureTenantId ?? 'common';
  const resolvedClientId = azureClientId ?? 'local-dev-client';
  const multiTenantAuthority = isMultiTenantAuthority(resolvedTenantId);
  const marketplaceSecrets = resolveMarketplaceSecrets(env, nodeEnv);

  return {
    port: Number(env.API_PORT ?? 3000),
    apiVersion: env.API_VERSION ?? 'v1',
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    auth: {
      issuer: normalizeUrl(
        env.ENTRA_ISSUER ??
          (multiTenantAuthority
            ? 'https://login.microsoftonline.com/{tenantId}/v2.0'
            : `https://login.microsoftonline.com/${resolvedTenantId}/v2.0`)
      ),
      audience: parseAudiences(env.ENTRA_AUDIENCE, resolvedClientId),
      jwksUri:
        env.ENTRA_JWKS_URI ??
        `https://login.microsoftonline.com/${multiTenantAuthority ? 'common' : resolvedTenantId}/discovery/v2.0/keys`,
      azureTenantId: resolvedTenantId,
      azureClientId: resolvedClientId,
      requiredScope: env.JWT_REQUIRED_SCOPE ?? 'api:read',
      tenantClaimKeys: ['tid', 'tenant_id', 'extension_tenant_id'],
      userClaimKeys: ['oid', 'sub'],
      bypassEnabled,
      devUserId: env.AUTH_DEV_USER_ID ?? 'dev-user',
      devTenantId: env.AUTH_DEV_TENANT_ID ?? 'dev-tenant'
    },
    marketplace: {
      baseUrl: normalizeUrl(env.MARKETPLACE_BASE_URL ?? 'https://marketplaceapi.microsoft.com'),
      apiVersion: env.MARKETPLACE_API_VERSION ?? '2018-08-31',
      clientId: env.MARKETPLACE_CLIENT_ID?.trim() || 'local-marketplace-client-id',
      tenantId: env.MARKETPLACE_TENANT_ID?.trim() || 'local-marketplace-tenant-id',
      clientSecret: marketplaceSecrets.clientSecret,
      tokenScope: env.MARKETPLACE_TOKEN_SCOPE?.trim() || 'https://graph.microsoft.com/.default',
      productIngestionBaseUrl:
        normalizeUrl(env.MARKETPLACE_PRODUCT_INGESTION_BASE_URL ?? 'https://graph.microsoft.com/rp/product-ingestion'),
      webhookSecret: marketplaceSecrets.webhookSecret,
      webhookAuthMode: parseMarketplaceWebhookAuthMode(env.MARKETPLACE_WEBHOOK_AUTH_MODE),
      webhookTimestampToleranceMs: Number(env.MARKETPLACE_WEBHOOK_TIMESTAMP_TOLERANCE_MS ?? 5 * 60 * 1000)
    },
    database: {
      url: env.DATABASE_URL
    },
    metering: {
      readScope: env.METERING_READ_SCOPE ?? 'metering:read',
      writeScope: env.METERING_WRITE_SCOPE ?? 'metering:write',
      batchSize: Number(env.METERING_BATCH_SIZE ?? 500),
      workerIntervalMs: Number(env.METERING_WORKER_INTERVAL_MS ?? 15000),
      claimLeaseMs: Number(env.METERING_CLAIM_LEASE_MS ?? 300000),
      retryBaseDelayMs: Number(env.METERING_RETRY_BASE_DELAY_MS ?? 60000),
      retryMaxDelayMs: Number(env.METERING_RETRY_MAX_DELAY_MS ?? 900000),
      retryJitterRatio: Number(env.METERING_RETRY_JITTER_RATIO ?? 0.1),
      maxRetries: Number(env.METERING_MAX_RETRIES ?? 8),
      submissionSlaMs: Number(env.METERING_SUBMISSION_SLA_MS ?? 4 * 60 * 60 * 1000),
      marketplaceEndpoint: env.MARKETPLACE_METERING_ENDPOINT
    },
    jobPolling: {
      batchSize: Number(env.JOB_POLLING_BATCH_SIZE ?? 100),
      workerIntervalMs: Number(env.JOB_POLLING_WORKER_INTERVAL_MS ?? 15000),
      pollBaseDelayMs: Number(env.JOB_POLLING_BASE_DELAY_MS ?? 5000),
      pollMaxDelayMs: Number(env.JOB_POLLING_MAX_DELAY_MS ?? 300000),
      pollJitterRatio: Number(env.JOB_POLLING_JITTER_RATIO ?? 0.2),
      maxPollDurationMs: Number(env.JOB_POLLING_MAX_DURATION_MS ?? 30 * 60 * 1000)
    }
  };
}
