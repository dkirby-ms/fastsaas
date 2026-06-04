import type { AuthClaims } from '@fastsaas/shared';
import type { NextFunction, Response } from 'express';
import { createRemoteJWKSet, decodeJwt, errors, jwtVerify, type JWTPayload } from 'jose';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { logger } from '../lib/logger';

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

  if (config.auth.azureTenantId === 'common' || config.auth.azureTenantId === 'organizations') {
    // Only accept GUID-format tenant IDs (real org tenants), reject 'common', 'consumers', 'organizations'.
    const orgIssuerPatterns = [
      /^https:\/\/login\.microsoftonline\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/v2\.0$/i,
      /^https:\/\/sts\.windows\.net\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    ];
    if (!orgIssuerPatterns.some((pattern) => pattern.test(issuer))) {
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
    roles: ['Admin']
  };
}

function isJwtClaimError(error: unknown): error is errors.JWTClaimValidationFailed | errors.JWTExpired {
  return error instanceof errors.JWTClaimValidationFailed || error instanceof errors.JWTExpired;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

function getClaimExpectedValue(claim: string, config: ApiConfig): unknown {
  switch (claim) {
    case 'aud':
      return config.auth.audience;
    case 'iss':
      return config.auth.issuer;
    case 'exp':
      return 'current time before token expiration';
    case 'nbf':
      return 'current time after token not-before';
    default:
      return undefined;
  }
}

function getClaimActualValue(error: errors.JWTClaimValidationFailed | errors.JWTExpired): unknown {
  const payload = error.payload as Record<string, unknown>;
  return payload[error.claim];
}

type UnverifiedTokenClaims = Pick<JWTPayload, 'aud' | 'iss' | 'exp' | 'nbf'>;

function getUnverifiedTokenClaims(token?: string): UnverifiedTokenClaims | undefined {
  if (!token) {
    return undefined;
  }

  try {
    const payload = decodeJwt(token);
    return {
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      nbf: payload.nbf
    };
  } catch {
    return undefined;
  }
}

function formatDiagnosticValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildClaimDiagnosticMessage(claim: string, expected: unknown, actual: unknown): string {
  switch (claim) {
    case 'aud':
      return `Bearer token audience mismatch (expected: ${formatDiagnosticValue(expected)}, got: ${formatDiagnosticValue(actual)})`;
    case 'iss':
      return `Bearer token issuer mismatch (expected: ${formatDiagnosticValue(expected)}, got: ${formatDiagnosticValue(actual)})`;
    case 'exp':
      return `Bearer token expired (exp: ${formatDiagnosticValue(actual)})`;
    case 'nbf':
      return `Bearer token not yet valid (nbf: ${formatDiagnosticValue(actual)})`;
    default:
      return `Bearer token claim validation failed for ${claim} (expected: ${formatDiagnosticValue(expected)}, got: ${formatDiagnosticValue(actual)})`;
  }
}

function buildTokenVerificationDiagnostics(error: unknown, config: ApiConfig, token?: string): Record<string, unknown> {
  const diagnostics: Record<string, unknown> = {};
  const unverifiedTokenClaims = getUnverifiedTokenClaims(token);

  if (isJwtClaimError(error)) {
    const expectedClaimValue = getClaimExpectedValue(error.claim, config);
    const actualClaimValue = getClaimActualValue(error)
      ?? unverifiedTokenClaims?.[error.claim as keyof UnverifiedTokenClaims];

    diagnostics.failedClaim = error.claim;
    diagnostics.claimValidationReason = error.reason;
    diagnostics.expectedClaimValue = expectedClaimValue;
    diagnostics.actualClaimValue = actualClaimValue;
    diagnostics.diagnosticMessage = buildClaimDiagnosticMessage(error.claim, expectedClaimValue, actualClaimValue);
  } else if (error instanceof Error) {
    diagnostics.diagnosticMessage = error.message;
  }

  if (unverifiedTokenClaims) {
    diagnostics.unverifiedTokenAudience = unverifiedTokenClaims.aud;
    diagnostics.unverifiedTokenIssuer = unverifiedTokenClaims.iss;
    diagnostics.unverifiedTokenExpiresAt = unverifiedTokenClaims.exp;
    diagnostics.unverifiedTokenNotBefore = unverifiedTokenClaims.nbf;
  }

  return diagnostics;
}

function isJwksEndpointUnreachableError(error: unknown): boolean {
  if (error instanceof errors.JWKSTimeout) {
    return true;
  }

  const code = getErrorCode(error);
  if (code && new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH']).has(code)) {
    return true;
  }

  return Boolean(error && typeof error === 'object' && 'cause' in error && isJwksEndpointUnreachableError(error.cause));
}

function logTokenVerificationFailure(req: ApiRequest, error: unknown, config: ApiConfig, token?: string): void {
  const authLogger = req.log ?? logger;
  const logContext: Record<string, unknown> = {
    err: error,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorCode: getErrorCode(error),
    requestId: req.id,
    correlationId: req.correlationId,
    ...buildTokenVerificationDiagnostics(error, config, token)
  };

  authLogger.warn(logContext, 'Bearer token verification failed');
}

function toAuthenticationError(error: unknown, config: ApiConfig, token?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const details = buildTokenVerificationDiagnostics(error, config, token);

  if (isJwksEndpointUnreachableError(error)) {
    return AppError.unauthorized('Token verification failed — JWKS endpoint unreachable', details);
  }

  return AppError.unauthorized('Bearer token is invalid or expired', details);
}

export function authenticateRequest(config: ApiConfig) {
  const jwks = config.auth.bypassEnabled ? undefined : createRemoteJWKSet(new URL(config.auth.jwksUri));

  return async function authenticate(req: ApiRequest, _res: Response, next: NextFunction): Promise<void> {
    if (config.auth.bypassEnabled) {
      req.auth = buildDevAuthClaims(config);
      next();
      return;
    }

    let token: string | undefined;

    try {
      token = getBearerToken(req.header('authorization'));
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
      if (!(error instanceof AppError)) {
        logTokenVerificationFailure(req, error, config, token);
      }

      next(toAuthenticationError(error, config, token));
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
