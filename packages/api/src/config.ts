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
    authToken: string;
    webhookSecret: string;
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
    marketplaceApiKey?: string;
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

export function createConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const bypassEnabled = env.AUTH_BYPASS_ENABLED === 'true';
  const azureTenantId = env.AZURE_AD_TENANT_ID?.trim();
  const azureClientId = env.AZURE_AD_CLIENT_ID?.trim();

  if (bypassEnabled && nodeEnv === 'production') {
    throw new Error('AUTH_BYPASS_ENABLED cannot be enabled in production');
  }

  if (!bypassEnabled && (!azureTenantId || !azureClientId)) {
    throw new Error('AZURE_AD_TENANT_ID and AZURE_AD_CLIENT_ID are required when auth bypass is disabled');
  }

  const resolvedTenantId = azureTenantId ?? 'common';
  const resolvedClientId = azureClientId ?? 'local-dev-client';

  return {
    port: Number(env.API_PORT ?? 3000),
    apiVersion: env.API_VERSION ?? 'v1',
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    auth: {
      issuer: normalizeUrl(env.AZURE_AD_ISSUER ?? `https://login.microsoftonline.com/${resolvedTenantId}/v2.0`),
      audience: parseAudiences(env.AZURE_AD_AUDIENCE, resolvedClientId),
      jwksUri: env.AZURE_AD_JWKS_URI ?? `https://login.microsoftonline.com/${resolvedTenantId}/discovery/v2.0/keys`,
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
      authToken: env.MARKETPLACE_AUTH_TOKEN ?? 'local-marketplace-token',
      webhookSecret: env.MARKETPLACE_WEBHOOK_SECRET ?? 'local-marketplace-webhook-secret',
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
      marketplaceEndpoint: env.MARKETPLACE_METERING_ENDPOINT,
      marketplaceApiKey: env.MARKETPLACE_METERING_API_KEY
    }
  };
}
