import { createPrivateKey, randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import type { Logger } from 'pino';

import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface TokenResponseShape {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

interface GraphOrganizationResponseShape {
  value?: Array<{
    id?: unknown;
    displayName?: unknown;
  }>;
}

export interface PartnerCenterValidationResult {
  organizationId?: string;
  displayName?: string;
}

export interface PartnerCenterAuthProvider {
  acquireGraphToken(account: PartnerCenterAccountRecord, credential: PartnerCenterCredentialRecord): Promise<string>;
  validateConnection(account: PartnerCenterAccountRecord, credential: PartnerCenterCredentialRecord): Promise<PartnerCenterValidationResult>;
  invalidate(accountId: string): void;
}

export class PartnerCenterAuthError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'PartnerCenterAuthError';
  }
}

export interface PartnerCenterAuthServiceOptions {
  logger: Logger;
  fetchImpl?: typeof fetch;
  graphBaseUrl?: string;
  secretResolver?: (secretReference: string) => Promise<string>;
  now?: () => Date;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

async function defaultSecretResolver(secretReference: string): Promise<string> {
  const normalizedReference = secretReference.trim();
  if (!normalizedReference.startsWith('env:')) {
    throw new PartnerCenterAuthError(
      'Unsupported secret reference. Use env:VARIABLE_NAME or configure a custom secret resolver.',
      'resolve-secret',
      400
    );
  }

  const environmentVariable = normalizedReference.slice(4).trim();
  if (!environmentVariable) {
    throw new PartnerCenterAuthError('env secret references must include a variable name', 'resolve-secret', 400);
  }

  const secretValue = process.env[environmentVariable]?.trim();
  if (!secretValue) {
    throw new PartnerCenterAuthError(
      `The secret reference ${normalizedReference} is not available in the process environment`,
      'resolve-secret',
      400
    );
  }

  return secretValue;
}

export class PartnerCenterAuthService implements PartnerCenterAuthProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly graphBaseUrl: string;
  private readonly secretResolver: (secretReference: string) => Promise<string>;
  private readonly now: () => Date;
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly options: PartnerCenterAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.graphBaseUrl = (options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL).replace(/\/+$/, '');
    this.secretResolver = options.secretResolver ?? defaultSecretResolver;
    this.now = options.now ?? (() => new Date());
  }

  invalidate(accountId: string): void {
    this.tokenCache.delete(accountId);
  }

  async acquireGraphToken(account: PartnerCenterAccountRecord, credential: PartnerCenterCredentialRecord): Promise<string> {
    const cachedToken = this.tokenCache.get(account.id);
    const now = this.now().getTime();
    if (cachedToken && cachedToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
      return cachedToken.token;
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(account.pcTenantId)}/oauth2/v2.0/token`;
    const requestBody = new URLSearchParams({
      client_id: account.clientId,
      scope: GRAPH_SCOPE,
      grant_type: 'client_credentials'
    });

    const secretValue = await this.secretResolver(credential.secretReference);
    if (account.authMode === 'CLIENT_SECRET') {
      requestBody.set('client_secret', secretValue);
    } else {
      requestBody.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      requestBody.set('client_assertion', await this.createClientAssertion(account, credential, secretValue, tokenEndpoint));
    }

    const response = await this.fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: requestBody
    });

    if (!response.ok) {
      const responseBody = await parseResponseBody(response);
      this.options.logger.warn(
        {
          accountId: account.id,
          action: 'acquire-graph-token',
          statusCode: response.status,
          responseBody
        },
        'Partner Center token acquisition failed'
      );

      throw new PartnerCenterAuthError(
        `Partner Center token request failed with status ${response.status}`,
        'acquire-graph-token',
        response.status,
        responseBody
      );
    }

    const payload = (await response.json()) as TokenResponseShape;
    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      throw new PartnerCenterAuthError('Partner Center token response did not include an access token', 'acquire-graph-token', 502, payload);
    }

    const expiresInSeconds = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    this.tokenCache.set(account.id, {
      token: payload.access_token,
      expiresAt: now + expiresInSeconds * 1000
    });

    return payload.access_token;
  }

  async validateConnection(
    account: PartnerCenterAccountRecord,
    credential: PartnerCenterCredentialRecord
  ): Promise<PartnerCenterValidationResult> {
    const token = await this.acquireGraphToken(account, credential);
    const response = await this.fetchImpl(`${this.graphBaseUrl}/v1.0/organization?$select=id,displayName`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const responseBody = await parseResponseBody(response);
      this.options.logger.warn(
        {
          accountId: account.id,
          action: 'validate-connection',
          statusCode: response.status,
          responseBody
        },
        'Partner Center Graph validation failed'
      );

      throw new PartnerCenterAuthError(
        `Partner Center validation request failed with status ${response.status}`,
        'validate-connection',
        response.status,
        responseBody
      );
    }

    const body = (await response.json()) as GraphOrganizationResponseShape;
    const organization = Array.isArray(body.value) ? body.value[0] : undefined;

    return {
      organizationId: typeof organization?.id === 'string' ? organization.id : undefined,
      displayName: typeof organization?.displayName === 'string' ? organization.displayName : undefined
    };
  }

  private async createClientAssertion(
    account: PartnerCenterAccountRecord,
    credential: PartnerCenterCredentialRecord,
    privateKeyPem: string,
    audience: string
  ): Promise<string> {
    const certificateThumbprint = this.resolveCertificateThumbprint(credential.rotationMetadata);
    const issuedAt = Math.floor(this.now().getTime() / 1000);

    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', x5t: certificateThumbprint })
      .setIssuer(account.clientId)
      .setSubject(account.clientId)
      .setAudience(audience)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 600)
      .sign(createPrivateKey(privateKeyPem));
  }

  private resolveCertificateThumbprint(rotationMetadata: Record<string, unknown> | undefined): string {
    const thumbprintCandidates = [rotationMetadata?.certificateThumbprint, rotationMetadata?.thumbprint, rotationMetadata?.x5t];
    const thumbprint = thumbprintCandidates.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );

    if (!thumbprint) {
      throw new PartnerCenterAuthError(
        'Certificate auth requires rotationMetadata.certificateThumbprint',
        'create-client-assertion',
        400
      );
    }

    return thumbprint;
  }
}
