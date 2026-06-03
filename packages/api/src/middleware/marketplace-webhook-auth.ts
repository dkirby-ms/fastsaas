import { createHmac, timingSafeEqual } from 'node:crypto';

import type { NextFunction, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';

const SIGNATURE_HEADERS = ['x-ms-marketplace-signature', 'x-marketplace-signature'];
const TIMESTAMP_HEADERS = ['x-ms-marketplace-timestamp', 'x-ms-signature-timestamp', 'x-marketplace-timestamp'];

function readHeader(req: ApiRequest, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.header(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeSignature(signature: string): Buffer[] {
  const trimmed = signature.trim().replace(/^sha256=/i, '');
  const candidates: Buffer[] = [];

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    candidates.push(Buffer.from(trimmed, 'hex'));
  }

  try {
    candidates.push(Buffer.from(trimmed, 'base64'));
  } catch {
    // Ignore invalid base64 candidate.
  }

  const base64Url = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  if (base64Url !== trimmed) {
    try {
      candidates.push(Buffer.from(base64Url, 'base64'));
    } catch {
      // Ignore invalid base64url candidate.
    }
  }

  return candidates.filter((candidate, index, all) => candidate.length > 0 && all.findIndex((other) => other.equals(candidate)) === index);
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function parseTimestamp(timestamp: string): number | null {
  if (/^\d+$/.test(timestamp)) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return timestamp.length > 10 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateSignature(rawBody: Buffer, timestamp: string, signature: string, secret: string): boolean {
  const digest = createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest();

  return normalizeSignature(signature).some((candidate) => candidate.length === digest.length && timingSafeEqual(candidate, digest));
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
  const marketplaceJwks = createRemoteJWKSet(new URL(config.marketplace.jwksUri));

  return async (req: ApiRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (config.marketplace.webhookAuthMode === 'none') {
      next();
      return;
    }

    const timestamp = readHeader(req, TIMESTAMP_HEADERS);
    const signature = readHeader(req, SIGNATURE_HEADERS);
    const requiresHmac = config.marketplace.webhookAuthMode === 'hmac';

    if (!requiresHmac && !timestamp && !signature) {
      try {
        await validateMarketplaceBearerToken(req, config, marketplaceJwks);
        next();
      } catch (error) {
        next(error instanceof AppError ? error : AppError.unauthorized('Marketplace webhook bearer token is invalid or expired'));
      }
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : undefined;
    if (!rawBody) {
      next(AppError.unauthorized('Marketplace webhook signature validation requires the raw request body'));
      return;
    }

    if (!timestamp) {
      next(AppError.unauthorized('Marketplace webhook timestamp header is required'));
      return;
    }

    if (!signature) {
      next(AppError.unauthorized('Marketplace webhook signature header is required'));
      return;
    }

    const timestampMs = parseTimestamp(timestamp);
    if (timestampMs === null) {
      next(AppError.unauthorized('Marketplace webhook timestamp header is invalid'));
      return;
    }

    const ageMs = Math.abs(Date.now() - timestampMs);
    if (ageMs > config.marketplace.webhookTimestampToleranceMs) {
      next(AppError.unauthorized('Marketplace webhook timestamp is outside the replay window', {
        replayWindowMs: config.marketplace.webhookTimestampToleranceMs
      }));
      return;
    }

    if (!validateSignature(rawBody, timestamp, signature, config.marketplace.webhookSecret)) {
      next(AppError.unauthorized('Marketplace webhook signature validation failed'));
      return;
    }

    next();
  };
}
