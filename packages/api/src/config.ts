export interface ApiConfig {
  port: number;
  apiVersion: string;
  auth: {
    issuer: string;
    audience: string;
    secret: string;
    requiredScope: string;
    tenantClaimKeys: string[];
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

export function createConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(env.API_PORT ?? 3000),
    apiVersion: env.API_VERSION ?? 'v1',
    auth: {
      issuer: env.JWT_ISSUER ?? 'https://fastsaas.b2clogin.com/fastsaas.onmicrosoft.com/B2C_1_signupsignin/v2.0/',
      audience: env.JWT_AUDIENCE ?? 'api://fastsaas',
      secret: env.JWT_SECRET ?? 'local-dev-secret',
      requiredScope: env.JWT_REQUIRED_SCOPE ?? 'api:read',
      tenantClaimKeys: ['tenant_id', 'tid', 'extension_tenant_id']
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
