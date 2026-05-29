import { createSecretKey } from 'node:crypto';

import type { AuthClaims } from '@fastsaas/shared';
import type { NextFunction, Response } from 'express';
import { jwtVerify } from 'jose';

import type { ApiConfig } from '../config';
import type { ApiRequest } from '../http';
import { AppError } from '../errors/app-error';

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

export function authenticateRequest(config: ApiConfig) {
  const key = createSecretKey(Buffer.from(config.auth.secret, 'utf8'));

  return async function authenticate(req: ApiRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      const token = getBearerToken(req.header('authorization'));
      const { payload } = await jwtVerify(token, key, {
        issuer: config.auth.issuer,
        audience: config.auth.audience
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
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
