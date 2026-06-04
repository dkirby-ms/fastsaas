import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Response } from 'express';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createConfig, type ApiConfig } from '../config';
import { AppError } from '../errors/app-error';
import type { ApiRequest } from '../http';
import { authenticateRequest } from '../middleware/auth';

let jwksServer: Server;
let signingKey: KeyLike;
let jwksUri: string;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'auth-middleware-test-key';
  jwk.use = 'sig';
  signingKey = privateKey;

  jwksServer = createServer((req, res) => {
    if (req.url !== '/discovery/v2.0/keys') {
      res.statusCode = 404;
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => {
    jwksServer.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = jwksServer.address() as AddressInfo;
  jwksUri = `http://127.0.0.1:${port}/discovery/v2.0/keys`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    jwksServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

function createApiConfig(overrides: Partial<Record<string, string>> = {}): ApiConfig {
  return createConfig({
    API_PORT: '3010',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'fastsaas-test-tenant',
    ENTRA_CLIENT_ID: 'fastsaas-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/fastsaas-test-tenant/v2.0',
    ENTRA_JWKS_URI: jwksUri,
    JWT_REQUIRED_SCOPE: 'api:read',
    ...overrides
  });
}

async function createToken(config: ApiConfig, overrides: { audience?: string } = {}): Promise<string> {
  return new SignJWT({
    oid: 'user-123',
    tid: config.auth.azureTenantId,
    scp: config.auth.requiredScope
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'auth-middleware-test-key' })
    .setIssuer(config.auth.issuer)
    .setAudience(overrides.audience ?? config.auth.audience[0])
    .setSubject('subject-123')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(signingKey);
}

async function reserveClosedPort(): Promise<number> {
  const server = createServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return port;
}

function createRequest(token: string) {
  const warn = vi.fn();
  const req = {
    header: vi.fn().mockReturnValue(`Bearer ${token}`),
    log: { warn },
    id: 'req-123',
    correlationId: 'corr-123'
  } as unknown as ApiRequest;

  return { req, warn };
}

describe('authenticateRequest', () => {
  it('logs JWT claim validation details before returning a generic auth error', async () => {
    const config = createApiConfig();
    const token = await createToken(config, { audience: 'api://wrong-audience' });
    const { req, warn } = createRequest(token);
    const next = vi.fn();

    await authenticateRequest(config)(req, {} as Response, next);

    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toBe('Bearer token is invalid or expired');
    expect((error as AppError).details).toEqual(
      expect.objectContaining({
        failedClaim: 'aud',
        expectedClaimValue: config.auth.audience,
        actualClaimValue: 'api://wrong-audience',
        diagnosticMessage: `Bearer token audience mismatch (expected: ${JSON.stringify(config.auth.audience)}, got: api://wrong-audience)`,
        unverifiedTokenAudience: 'api://wrong-audience',
        unverifiedTokenIssuer: config.auth.issuer
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorName: 'JWTClaimValidationFailed',
        errorMessage: expect.stringContaining('aud'),
        failedClaim: 'aud',
        expectedClaimValue: config.auth.audience,
        actualClaimValue: 'api://wrong-audience',
        unverifiedTokenAudience: 'api://wrong-audience',
        unverifiedTokenIssuer: config.auth.issuer,
        unverifiedTokenExpiresAt: expect.any(Number),
        requestId: 'req-123',
        correlationId: 'corr-123'
      }),
      'Bearer token verification failed'
    );
  });

  it('returns a JWKS-specific auth error when the JWKS endpoint is unreachable', async () => {
    const closedPort = await reserveClosedPort();
    const config = createApiConfig({ ENTRA_JWKS_URI: `http://127.0.0.1:${closedPort}/discovery/v2.0/keys` });
    const token = await createToken(config);
    const { req, warn } = createRequest(token);
    const next = vi.fn();

    await authenticateRequest(config)(req, {} as Response, next);

    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toBe('Token verification failed — JWKS endpoint unreachable');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: expect.any(String),
        errorCode: 'ECONNREFUSED',
        requestId: 'req-123',
        correlationId: 'corr-123'
      }),
      'Bearer token verification failed'
    );
  });
});
