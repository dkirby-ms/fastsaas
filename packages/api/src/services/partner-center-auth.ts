import { createPrivateKey, randomUUID } from 'node:crypto';

import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { SignJWT } from 'jose';
import type { Logger } from 'pino';

import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com';
const DEFAULT_PRODUCT_INGESTION_API_VERSION = '2022-03-01-preview5';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const ENV_SECRET_PREFIX = 'env:';
const KEY_VAULT_REFERENCE_PREFIX = 'keyvault:';

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

interface KeyVaultSecretReference {
  vaultUrl: string;
  secretName: string;
  version?: string;
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
  productIngestionApiVersion?: string;
  keyVaultUrl?: string;
  allowEnvironmentSecretReferences?: boolean;
  secretResolver?: (secretReference: string) => Promise<string>;
  now?: () => Date;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeSecretReference(secretReference: string): string {
  const normalizedReference = secretReference.trim();
  if (!normalizedReference) {
    throw new PartnerCenterAuthError('secretReference must not be empty', 'resolve-secret', 400);
  }

  return normalizedReference;
}

function resolveEnvironmentSecret(secretReference: string): string {
  const environmentVariable = secretReference.slice(ENV_SECRET_PREFIX.length).trim();
  if (!environmentVariable) {
    throw new PartnerCenterAuthError('env secret references must include a variable name', 'resolve-secret', 400);
  }

  const secretValue = process.env[environmentVariable]?.trim();
  if (!secretValue) {
    throw new PartnerCenterAuthError(
      `The secret reference ${secretReference} is not available in the process environment`,
      'resolve-secret',
      400
    );
  }

  return secretValue;
}

function parseKeyVaultSecretUri(secretReference: string): KeyVaultSecretReference {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(secretReference);
  } catch {
    throw new PartnerCenterAuthError('Azure Key Vault secret references must be valid HTTPS URLs', 'resolve-secret', 400);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new PartnerCenterAuthError('Azure Key Vault secret references must use HTTPS', 'resolve-secret', 400);
  }

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  if (pathSegments[0] !== 'secrets' || pathSegments.length < 2) {
    throw new PartnerCenterAuthError(
      'Azure Key Vault secret references must use the /secrets/<name>[/version] path',
      'resolve-secret',
      400
    );
  }

  return {
    vaultUrl: normalizeBaseUrl(`${parsedUrl.protocol}//${parsedUrl.host}`),
    secretName: decodeURIComponent(pathSegments[1]),
    version: pathSegments[2] ? decodeURIComponent(pathSegments[2]) : undefined
  };
}

function parseKeyVaultSecretReference(secretReference: string, keyVaultUrl?: string): KeyVaultSecretReference {
  if (secretReference.startsWith(KEY_VAULT_REFERENCE_PREFIX)) {
    const referenceValue = secretReference.slice(KEY_VAULT_REFERENCE_PREFIX.length).trim();
    if (!referenceValue) {
      throw new PartnerCenterAuthError(
        'keyvault secret references must include a secret name or full secret URI',
        'resolve-secret',
        400
      );
    }

    if (referenceValue.startsWith('https://')) {
      return parseKeyVaultSecretUri(referenceValue);
    }

    if (!keyVaultUrl?.trim()) {
      throw new PartnerCenterAuthError(
        'AZURE_KEY_VAULT_URL is required when using keyvault:SECRET_NAME references',
        'resolve-secret',
        400
      );
    }

    return {
      vaultUrl: normalizeBaseUrl(keyVaultUrl.trim()),
      secretName: referenceValue
    };
  }

  if (secretReference.startsWith('https://')) {
    return parseKeyVaultSecretUri(secretReference);
  }

  throw new PartnerCenterAuthError(
    'Unsupported secret reference. Use an Azure Key Vault secret URI, keyvault:SECRET_NAME, or env:VARIABLE_NAME in local/test environments.',
    'resolve-secret',
    400
  );
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return undefined;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

// TODO(issue #78): This tenant-scoped Partner Center auth flow is legacy compatibility.
// Single-publisher deployments should prefer MarketplaceOAuthService.
export class PartnerCenterAuthService implements PartnerCenterAuthProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly graphBaseUrl: string;
  private readonly productIngestionApiVersion: string;
  private readonly keyVaultUrl?: string;
  private readonly allowEnvironmentSecretReferences: boolean;
  private readonly secretResolver: (secretReference: string) => Promise<string>;
  private readonly now: () => Date;
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private readonly secretClients = new Map<string, SecretClient>();
  private readonly keyVaultCredential = new DefaultAzureCredential();

  constructor(private readonly options: PartnerCenterAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.graphBaseUrl = normalizeBaseUrl(options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL);
    this.productIngestionApiVersion = options.productIngestionApiVersion ?? DEFAULT_PRODUCT_INGESTION_API_VERSION;
    this.keyVaultUrl = options.keyVaultUrl?.trim() || undefined;
    this.allowEnvironmentSecretReferences = options.allowEnvironmentSecretReferences ?? true;
    this.secretResolver = options.secretResolver ?? (async (secretReference) => this.resolveSecretValue(secretReference));
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
    await this.validateProductIngestionAccess(account.id, token);

    const organization = await this.tryGetOrganization(account.id, token);
    const resolvedOrganization = Array.isArray(organization?.value) ? organization.value[0] : undefined;

    return {
      organizationId: typeof resolvedOrganization?.id === 'string' ? resolvedOrganization.id : undefined,
      displayName: typeof resolvedOrganization?.displayName === 'string' ? resolvedOrganization.displayName : undefined
    };
  }

  private async validateProductIngestionAccess(accountId: string, token: string): Promise<void> {
    const validationUrl = new URL('/rp/product-ingestion/product', `${this.graphBaseUrl}/`);
    validationUrl.searchParams.set('$version', this.productIngestionApiVersion);
    validationUrl.searchParams.set('$maxpagesize', '1');

    const response = await this.fetchImpl(validationUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const responseBody = await parseResponseBody(response);
      this.options.logger.warn(
        {
          accountId,
          action: 'validate-product-ingestion-access',
          statusCode: response.status,
          responseBody
        },
        'Partner Center Product Ingestion validation failed'
      );

      throw new PartnerCenterAuthError(
        `Partner Center Product Ingestion validation request failed with status ${response.status}`,
        'validate-product-ingestion-access',
        response.status,
        responseBody
      );
    }
  }

  private async tryGetOrganization(accountId: string, token: string): Promise<GraphOrganizationResponseShape | undefined> {
    try {
      const response = await this.fetchImpl(`${this.graphBaseUrl}/v1.0/organization?$select=id,displayName`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const responseBody = await parseResponseBody(response);
        this.options.logger.info(
          {
            accountId,
            action: 'lookup-organization',
            statusCode: response.status,
            responseBody
          },
          'Partner Center organization lookup skipped after Product Ingestion validation'
        );
        return undefined;
      }

      return (await response.json()) as GraphOrganizationResponseShape;
    } catch (error) {
      this.options.logger.info(
        {
          accountId,
          action: 'lookup-organization',
          err: error
        },
        'Partner Center organization lookup skipped after Product Ingestion validation'
      );
      return undefined;
    }
  }

  private async resolveSecretValue(secretReference: string): Promise<string> {
    const normalizedReference = normalizeSecretReference(secretReference);

    if (normalizedReference.startsWith(ENV_SECRET_PREFIX)) {
      if (!this.allowEnvironmentSecretReferences) {
        throw new PartnerCenterAuthError(
          'Environment-backed secret references are disabled in this environment. Use an Azure Key Vault secret URI or keyvault:SECRET_NAME reference instead.',
          'resolve-secret',
          400
        );
      }

      return resolveEnvironmentSecret(normalizedReference);
    }

    const keyVaultReference = parseKeyVaultSecretReference(normalizedReference, this.keyVaultUrl);

    try {
      const response = await this.getSecretClient(keyVaultReference.vaultUrl).getSecret(
        keyVaultReference.secretName,
        keyVaultReference.version ? { version: keyVaultReference.version } : {}
      );
      const secretValue = response.value?.trim();
      if (!secretValue) {
        throw new PartnerCenterAuthError(
          `Azure Key Vault secret ${keyVaultReference.secretName} did not include a value`,
          'resolve-secret',
          400
        );
      }

      return secretValue;
    } catch (error) {
      if (error instanceof PartnerCenterAuthError) {
        throw error;
      }

      const statusCode = extractStatusCode(error);
      const message =
        statusCode === 404
          ? `Azure Key Vault secret ${keyVaultReference.secretName} was not found`
          : `Failed to resolve Azure Key Vault secret ${keyVaultReference.secretName}`;

      throw new PartnerCenterAuthError(message, 'resolve-secret', statusCode === 404 ? 400 : 503, error);
    }
  }

  private getSecretClient(vaultUrl: string): SecretClient {
    const normalizedVaultUrl = normalizeBaseUrl(vaultUrl);
    const existingClient = this.secretClients.get(normalizedVaultUrl);
    if (existingClient) {
      return existingClient;
    }

    const client = new SecretClient(normalizedVaultUrl, this.keyVaultCredential);
    this.secretClients.set(normalizedVaultUrl, client);
    return client;
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
