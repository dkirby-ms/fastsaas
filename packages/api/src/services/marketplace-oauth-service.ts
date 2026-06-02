import type { Logger } from 'pino';

import type { ApiConfig } from '../config';
import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';
import { PartnerCenterAuthError, type PartnerCenterAuthProvider, type PartnerCenterValidationResult } from './partner-center-auth';

const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface TokenResponseShape {
  access_token?: unknown;
  expires_in?: unknown;
  expires_on?: unknown;
  token_type?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
  error_codes?: unknown;
  trace_id?: unknown;
  correlation_id?: unknown;
}

export interface MarketplaceBearerTokenProvider {
  getAccessToken(): Promise<string>;
  invalidate(accountId?: string): void;
}

export interface MarketplaceOAuthServiceOptions {
  logger: Logger;
  marketplace: ApiConfig['marketplace'];
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function toExpiryTimestamp(payload: TokenResponseShape, now: number): number {
  if (typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) && payload.expires_in > 0) {
    return now + payload.expires_in * 1000;
  }

  if (typeof payload.expires_on === 'number' && Number.isFinite(payload.expires_on) && payload.expires_on > 0) {
    return payload.expires_on * 1000;
  }

  if (typeof payload.expires_on === 'string' && payload.expires_on.trim().length > 0) {
    const numericValue = Number(payload.expires_on);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue * 1000;
    }

    const parsedValue = Date.parse(payload.expires_on);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  return now + 3600 * 1000;
}

function buildAzureAdErrorMessage(statusCode: number, responseBody: unknown): string {
  if (!isRecord(responseBody)) {
    return `Azure AD marketplace token request failed with status ${statusCode}`;
  }

  const errorCode = typeof responseBody.error === 'string' ? responseBody.error : 'token_request_failed';
  const description = typeof responseBody.error_description === 'string' ? responseBody.error_description : undefined;

  return description
    ? `Azure AD marketplace token request failed (${errorCode}): ${description}`
    : `Azure AD marketplace token request failed (${errorCode}) with status ${statusCode}`;
}

export class MarketplaceOAuthService implements MarketplaceBearerTokenProvider, PartnerCenterAuthProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private cachedToken?: { accessToken: string; expiresAt: number };

  constructor(private readonly options: MarketplaceOAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  invalidate(_accountId?: string): void {
    this.cachedToken = undefined;
  }

  async getAccessToken(): Promise<string> {
    const now = this.now().getTime();
    if (this.cachedToken && this.cachedToken.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
      return this.cachedToken.accessToken;
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(this.options.marketplace.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.options.marketplace.clientId,
      client_secret: this.options.marketplace.clientSecret,
      scope: this.options.marketplace.tokenScope,
      grant_type: 'client_credentials'
    });

    const response = await this.fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const responseBody = await parseResponseBody(response);
      this.options.logger.warn(
        {
          action: 'acquire-marketplace-token',
          statusCode: response.status,
          responseBody
        },
        'Marketplace OAuth token acquisition failed'
      );

      throw new PartnerCenterAuthError(
        buildAzureAdErrorMessage(response.status, responseBody),
        'acquire-marketplace-token',
        response.status,
        responseBody
      );
    }

    const payload = (await response.json()) as TokenResponseShape;
    if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
      throw new PartnerCenterAuthError(
        'Azure AD marketplace token response did not include an access token',
        'acquire-marketplace-token',
        502,
        payload
      );
    }

    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: toExpiryTimestamp(payload, now)
    };

    return payload.access_token;
  }

  async acquireGraphToken(_account: PartnerCenterAccountRecord, _credential: PartnerCenterCredentialRecord): Promise<string> {
    return this.getAccessToken();
  }

  async validateConnection(
    _account: PartnerCenterAccountRecord,
    _credential: PartnerCenterCredentialRecord
  ): Promise<PartnerCenterValidationResult> {
    await this.getAccessToken();
    return {};
  }
}
