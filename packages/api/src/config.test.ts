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

    expect(developmentConfig.marketplace.authToken).toBe('local-marketplace-token');
    expect(developmentConfig.marketplace.webhookSecret).toBe('local-marketplace-webhook-secret');
    expect(testConfig.marketplace.authToken).toBe('local-marketplace-token');
    expect(testConfig.marketplace.webhookSecret).toBe('local-marketplace-webhook-secret');
  });

  it('throws when marketplace secrets are missing outside development and test', () => {
    expect(() =>
      createConfig({
        NODE_ENV: 'production',
        ENTRA_CLIENT_ID: 'fastsaas-api-client'
      })
    ).toThrow(
      'Missing required marketplace secrets for NODE_ENV=production: MARKETPLACE_AUTH_TOKEN, MARKETPLACE_WEBHOOK_SECRET. Fallback values are only allowed in development and test environments.'
    );

    expect(() =>
      createConfig({
        NODE_ENV: 'staging',
        ENTRA_CLIENT_ID: 'fastsaas-api-client',
        MARKETPLACE_AUTH_TOKEN: 'token-present'
      })
    ).toThrow(
      'Missing required marketplace secrets for NODE_ENV=staging: MARKETPLACE_WEBHOOK_SECRET. Fallback values are only allowed in development and test environments.'
    );
  });
});
