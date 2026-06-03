import type { NextFunction, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader) {
    throw AppError.unauthorized('Marketplace webhook authorization header is required');
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Marketplace webhook authorization header must use the Bearer scheme');
  }

  return token;
}

function validateMarketplaceIssuer(payload: JWTPayload, config: ApiConfig): void {
  const issuer = typeof payload.iss === 'string' ? normalizeUrl(payload.iss) : undefined;
  if (!issuer) {
    throw AppError.unauthorized('Marketplace webhook bearer token issuer claim is required');
  }

  const expectedIssuers = [
    `https://login.microsoftonline.com/${config.marketplace.tenantId}/v2.0`,
    `https://sts.windows.net/${config.marketplace.tenantId}/`
  ].map(normalizeUrl);

  if (!expectedIssuers.includes(issuer)) {
    throw AppError.unauthorized('Marketplace webhook bearer token issuer is invalid');
  }

  const tokenTenantId = typeof payload.tid === 'string' ? payload.tid : undefined;
  if (tokenTenantId && tokenTenantId !== config.marketplace.tenantId) {
    throw AppError.unauthorized('Marketplace webhook bearer token was issued for a different tenant', { tokenTenantId });
  }
}

async function validateMarketplaceBearerToken(req: ApiRequest, config: ApiConfig, jwks: ReturnType<typeof createRemoteJWKSet>): Promise<void> {
  const token = getBearerToken(req.header('authorization'));
  const { payload } = await jwtVerify(token, jwks, {
    audience: config.marketplace.expectedAudience,
    algorithms: ['RS256']
  });

  validateMarketplaceIssuer(payload, config);
}

export function createMarketplaceWebhookAuth(config: ApiConfig): RequestHandler {
  if (config.marketplace.webhookAuthMode === 'none') {
    return (_req: ApiRequest, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const marketplaceJwks = createRemoteJWKSet(new URL(config.marketplace.jwksUri));

  return async (req: ApiRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await validateMarketplaceBearerToken(req, config, marketplaceJwks);
      next();
    } catch (error) {
      next(error instanceof AppError ? error : AppError.unauthorized('Marketplace webhook bearer token is invalid or expired'));
    }
  };
}
