export interface ApiConfig {
  port: number;
  apiVersion: string;
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
    }
  };
}
