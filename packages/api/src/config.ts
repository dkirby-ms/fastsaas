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
    }
  };
}
