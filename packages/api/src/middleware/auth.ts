import type { AuthClaims } from '@fastsaas/shared';
import type { NextFunction, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';

function getBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader) {
    throw AppError.unauthorized('Missing bearer token');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Authorization header must use the Bearer scheme');
  }

  return token;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getScopes(claims: Partial<AuthClaims> | undefined): string[] {
  if (!claims) {
    return [];
  }

  const scopes = new Set<string>();
  const scopeValues = [claims.scope, typeof claims.scp === 'string' ? claims.scp : undefined];

  for (const value of scopeValues) {
    if (typeof value !== 'string') {
      continue;
    }

    for (const scope of value.split(' ').filter(Boolean)) {
      scopes.add(scope);
    }
  }

  return [...scopes];
}

export function getRoles(claims: Partial<AuthClaims> | undefined): string[] {
  if (!claims) {
    return [];
  }

  if (Array.isArray(claims.roles)) {
    return claims.roles.filter((role: unknown): role is string => typeof role === 'string');
  }

  if (typeof claims.roles === 'string') {
    return claims.roles.split(' ').filter(Boolean);
  }

  return [];
}

export function getUserId(claims: Partial<AuthClaims> | undefined): string | undefined {
  if (!claims) {
    return undefined;
  }

  const candidates = [claims.oid, claims.sub];
  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function validateIssuer(payload: JWTPayload, config: ApiConfig): void {
  const issuer = typeof payload.iss === 'string' ? normalizeUrl(payload.iss) : undefined;
  if (!issuer) {
    throw AppError.unauthorized('Token issuer claim is required');
  }

  const tokenTenantId = typeof payload.tid === 'string' ? payload.tid : undefined;

  if (config.auth.azureTenantId === 'common') {
    const commonIssuerPattern = /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/;
    if (!commonIssuerPattern.test(issuer)) {
      throw AppError.unauthorized('Bearer token issuer is invalid');
    }

    return;
  }

  if (issuer !== config.auth.issuer) {
    throw AppError.unauthorized('Bearer token issuer is invalid');
  }

  if (tokenTenantId && tokenTenantId !== config.auth.azureTenantId) {
    throw AppError.forbidden('The access token was issued for a different tenant', { tokenTenantId });
  }
}

function buildDevAuthClaims(config: ApiConfig): AuthClaims {
  return {
    sub: config.auth.devUserId,
    iss: config.auth.issuer,
    aud: config.auth.audience,
    oid: config.auth.devUserId,
    tid: config.auth.devTenantId,
    scp: config.auth.requiredScope,
    roles: ['developer']
  };
}

export function authenticateRequest(config: ApiConfig) {
  const jwks = config.auth.bypassEnabled ? undefined : createRemoteJWKSet(new URL(config.auth.jwksUri));

  return async function authenticate(req: ApiRequest, _res: Response, next: NextFunction): Promise<void> {
    if (config.auth.bypassEnabled) {
      req.auth = buildDevAuthClaims(config);
      next();
      return;
    }

    try {
      const token = getBearerToken(req.header('authorization'));
      const { payload } = await jwtVerify(token, jwks!, {
        audience: config.auth.audience,
        algorithms: ['RS256']
      });

      validateIssuer(payload, config);

      if (!getUserId(payload as Partial<AuthClaims>)) {
        throw AppError.unauthorized('Token subject claim is required');
      }

      req.auth = payload as AuthClaims;
      next();
    } catch (error) {
      next(error instanceof AppError ? error : AppError.unauthorized('Bearer token is invalid or expired'));
    }
  };
}

export function requireScopes(requiredScopes: string[]) {
  return function authorize(req: ApiRequest, _res: Response, next: NextFunction): void {
    const tokenScopes = getScopes(req.auth);
    const missingScopes = requiredScopes.filter((scope) => !tokenScopes.includes(scope));

    if (missingScopes.length > 0) {
      next(AppError.forbidden('The access token is missing required scopes', { missingScopes }));
      return;
    }

    next();
  };
}
