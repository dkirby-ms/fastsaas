import { describe, expect, it } from 'vitest';

import { createConfig } from './config';

describe('createConfig auth defaults', () => {
  it('defaults to common multi-tenant auth when ENTRA_TENANT_ID is unset', () => {
    const config = createConfig({
      NODE_ENV: 'test',
      ENTRA_CLIENT_ID: 'fastsaas-api-client'
    });

    expect(config.auth.azureTenantId).toBe('common');
    expect(config.auth.issuer).toBe('https://login.microsoftonline.com/{tenantId}/v2.0');
    expect(config.auth.jwksUri).toBe('https://login.microsoftonline.com/common/discovery/v2.0/keys');
  });

  it('uses the common JWKS endpoint for organizations authority', () => {
    const config = createConfig({
      NODE_ENV: 'test',
      ENTRA_TENANT_ID: 'organizations',
      ENTRA_CLIENT_ID: 'fastsaas-api-client'
    });

    expect(config.auth.azureTenantId).toBe('organizations');
    expect(config.auth.issuer).toBe('https://login.microsoftonline.com/{tenantId}/v2.0');
    expect(config.auth.jwksUri).toBe('https://login.microsoftonline.com/common/discovery/v2.0/keys');
  });

  it('keeps tenant-specific issuer and JWKS settings for single-tenant auth', () => {
    const config = createConfig({
      NODE_ENV: 'test',
      ENTRA_TENANT_ID: 'publisher-tenant',
      ENTRA_CLIENT_ID: 'fastsaas-api-client'
    });

    expect(config.auth.azureTenantId).toBe('publisher-tenant');
    expect(config.auth.issuer).toBe('https://login.microsoftonline.com/publisher-tenant/v2.0');
    expect(config.auth.jwksUri).toBe('https://login.microsoftonline.com/publisher-tenant/discovery/v2.0/keys');
  });

  it('uses marketplace fallback secrets in development and test', () => {
    const developmentConfig = createConfig({
      NODE_ENV: 'development',
      ENTRA_CLIENT_ID: 'fastsaas-api-client'
    });
    const testConfig = createConfig({
      NODE_ENV: 'test',
      ENTRA_CLIENT_ID: 'fastsaas-api-client'
    });

    expect(developmentConfig.marketplace.clientId).toBe('local-marketplace-client-id');
    expect(developmentConfig.marketplace.tenantId).toBe('local-marketplace-tenant-id');
    expect(developmentConfig.marketplace.clientSecret).toBe('local-marketplace-client-secret');
    expect(developmentConfig.marketplace.tokenScope).toBe('https://graph.microsoft.com/.default');
    expect(developmentConfig.marketplace.productIngestionBaseUrl).toBe('https://graph.microsoft.com/rp/product-ingestion');
    expect(developmentConfig.marketplace.jwksUri).toBe('https://login.microsoftonline.com/common/discovery/v2.0/keys');
    expect(developmentConfig.marketplace.expectedAudience).toBe('local-marketplace-client-id');
    expect(developmentConfig.marketplace.webhookAuthMode).toBe('jwt');
    expect(developmentConfig.metering.marketplaceEndpoint).toBeUndefined();
    expect(testConfig.marketplace.clientId).toBe('local-marketplace-client-id');
    expect(testConfig.marketplace.tenantId).toBe('local-marketplace-tenant-id');
    expect(testConfig.marketplace.clientSecret).toBe('local-marketplace-client-secret');
    expect(testConfig.marketplace.tokenScope).toBe('https://graph.microsoft.com/.default');
    expect(testConfig.marketplace.productIngestionBaseUrl).toBe('https://graph.microsoft.com/rp/product-ingestion');
    expect(testConfig.marketplace.jwksUri).toBe('https://login.microsoftonline.com/common/discovery/v2.0/keys');
    expect(testConfig.marketplace.expectedAudience).toBe('local-marketplace-client-id');
    expect(testConfig.marketplace.webhookAuthMode).toBe('jwt');
    expect(testConfig.metering.marketplaceEndpoint).toBeUndefined();
  });

  it('uses the shared marketplace client secret for metering', () => {
    const config = createConfig({
      NODE_ENV: 'production',
      ENTRA_CLIENT_ID: 'fastsaas-api-client',
      MARKETPLACE_CLIENT_ID: 'shared-marketplace-client-id',
      MARKETPLACE_TENANT_ID: 'shared-marketplace-tenant-id',
      MARKETPLACE_CLIENT_SECRET: 'shared-client-secret',
      MARKETPLACE_TOKEN_SCOPE: 'https://graph.microsoft.com/.default',
      MARKETPLACE_PRODUCT_INGESTION_BASE_URL: 'https://graph.microsoft.com/rp/product-ingestion',
      MARKETPLACE_METERING_ENDPOINT: 'https://marketplace.example.test/api/usageEvent?api-version=2018-08-31'
    });

    expect(config.marketplace.clientId).toBe('shared-marketplace-client-id');
    expect(config.marketplace.tenantId).toBe('shared-marketplace-tenant-id');
    expect(config.marketplace.clientSecret).toBe('shared-client-secret');
    expect(config.marketplace.jwksUri).toBe('https://login.microsoftonline.com/common/discovery/v2.0/keys');
    expect(config.marketplace.expectedAudience).toBe('shared-marketplace-client-id');
    expect(config.marketplace.tokenScope).toBe('https://graph.microsoft.com/.default');
    expect(config.marketplace.productIngestionBaseUrl).toBe('https://graph.microsoft.com/rp/product-ingestion');
    expect(config.marketplace.webhookAuthMode).toBe('jwt');
    expect(config.metering.marketplaceEndpoint).toBe('https://marketplace.example.test/api/usageEvent?api-version=2018-08-31');
  });

  it('accepts an explicit marketplace webhook auth mode outside production', () => {
    const config = createConfig({
      NODE_ENV: 'test',
      ENTRA_CLIENT_ID: 'fastsaas-api-client',
      MARKETPLACE_WEBHOOK_AUTH_MODE: 'none'
    });

    expect(config.marketplace.webhookAuthMode).toBe('none');
  });

  it('throws when marketplace webhook auth mode is none in production', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        ENTRA_CLIENT_ID: 'fastsaas-api-client',
        MARKETPLACE_CLIENT_SECRET: 'shared-client-secret',
        MARKETPLACE_WEBHOOK_AUTH_MODE: 'none'
      })
    ).toThrow('MARKETPLACE_WEBHOOK_AUTH_MODE=none is not allowed in production');
  });

  it('accepts explicit marketplace webhook audience and JWKS overrides', () => {
    const config = createConfig({
      NODE_ENV: 'production',
      ENTRA_CLIENT_ID: 'fastsaas-api-client',
      MARKETPLACE_CLIENT_ID: 'shared-marketplace-client-id',
      MARKETPLACE_CLIENT_SECRET: 'shared-client-secret',
      MARKETPLACE_EXPECTED_AUDIENCE: 'api://webhook-audience',
      MARKETPLACE_JWKS_URI: 'https://contoso.example.test/jwks.json'
    });

    expect(config.marketplace.expectedAudience).toBe('api://webhook-audience');
    expect(config.marketplace.jwksUri).toBe('https://contoso.example.test/jwks.json');
  });

  it('throws for an invalid marketplace webhook auth mode', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'test',
        ENTRA_CLIENT_ID: 'fastsaas-api-client',
        MARKETPLACE_WEBHOOK_AUTH_MODE: 'invalid'
      })
    ).toThrow('MARKETPLACE_WEBHOOK_AUTH_MODE must be one of: jwt, none');
  });

  it('throws when marketplace secrets are missing outside development and test', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        ENTRA_CLIENT_ID: 'fastsaas-api-client'
      })
    ).toThrow(
      'Missing required marketplace secrets for NODE_ENV=production: MARKETPLACE_CLIENT_SECRET. Fallback values are only allowed in development and test environments.'
    );

    expect(() =>
      createConfig({
        NODE_ENV: 'staging',
        ENTRA_CLIENT_ID: 'fastsaas-api-client'
      })
    ).toThrow(
      'Missing required marketplace secrets for NODE_ENV=staging: MARKETPLACE_CLIENT_SECRET. Fallback values are only allowed in development and test environments.'
    );
  });
});
