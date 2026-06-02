import type { Logger } from 'pino';

import type { PartnerCenterAccountRecord, PartnerCenterCredentialRecord } from '../repositories/partner-center-repository';
import type { PartnerCenterAuthProvider } from '../services/partner-center-auth';
import {
  PRODUCT_INGESTION_API_VERSION,
  PRODUCT_INGESTION_BASE_URL,
  type ProductIngestionConfigureDetail,
  type ProductIngestionConfigureRequest,
  type ProductIngestionConfigureStatus,
  type ProductIngestionJobError,
  type ProductIngestionJobFailureDetail,
  type ProductIngestionInnerError,
  type ProductIngestionResource,
  type ProductIngestionResourceReference,
  type ProductIngestionResourceTreeResponse
} from './product-ingestion-types';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeResourceReference(value: unknown): ProductIngestionResourceReference | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const resourceName = toStringOrUndefined(value.resourceName);
  if (resourceName) {
    return { resourceName };
  }

  const externalId = toStringOrUndefined(value.externalId) ?? toStringOrUndefined(value.externalID);
  if (externalId) {
    return { externalId };
  }

  return undefined;
}

function normalizeInnerError(value: unknown): ProductIngestionInnerError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = toStringOrUndefined(value.code);
  if (!code) {
    return undefined;
  }

  return {
    resourceId: normalizeResourceReference(value.resourceId),
    code,
    message: toStringOrUndefined(value.message),
    details: Array.isArray(value.details)
      ? value.details.map((detail) => normalizeInnerError(detail)).filter((detail): detail is ProductIngestionInnerError => Boolean(detail))
      : undefined
  };
}

function normalizeJobError(value: unknown): ProductIngestionJobError | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = toStringOrUndefined(value.code);
  if (!code) {
    return undefined;
  }

  return {
    resourceId: normalizeResourceReference(value.resourceId),
    code,
    message: toStringOrUndefined(value.message),
    details: Array.isArray(value.details)
      ? value.details.map((detail) => normalizeInnerError(detail)).filter((detail): detail is ProductIngestionInnerError => Boolean(detail))
      : undefined
  };
}

function flattenInnerErrors(errors: ProductIngestionInnerError[] | undefined, flattened: ProductIngestionJobFailureDetail[]): void {
  if (!errors) {
    return;
  }

  for (const error of errors) {
    flattened.push({
      level: 'detail',
      code: error.code,
      message: error.message,
      resourceId: error.resourceId
    });
    flattenInnerErrors(error.details, flattened);
  }
}

function flattenJobErrors(errors: ProductIngestionJobError[]): ProductIngestionJobFailureDetail[] {
  const flattened: ProductIngestionJobFailureDetail[] = [];

  for (const error of errors) {
    flattened.push({
      level: 'job',
      code: error.code,
      message: error.message,
      resourceId: error.resourceId
    });
    flattenInnerErrors(error.details, flattened);
  }

  return flattened;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return Math.max(0, timestamp - Date.now());
}

export interface ProductIngestionClientOptions {
  logger: Logger;
  authProvider: PartnerCenterAuthProvider;
  account: PartnerCenterAccountRecord;
  credential: PartnerCenterCredentialRecord;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  apiVersion?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface WaitForConfigureCompletionOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface ProductIngestionClientLike {
  getResourceTree<TResource extends ProductIngestionResource = ProductIngestionResource>(
    productDurableId: string,
    targetType?: 'draft' | 'preview' | 'live'
  ): Promise<ProductIngestionResourceTreeResponse<TResource>>;
  configure<TResource extends ProductIngestionResource = ProductIngestionResource>(
    request: ProductIngestionConfigureRequest<TResource>
  ): Promise<ProductIngestionConfigureStatus>;
  getConfigureStatus(jobId: string): Promise<ProductIngestionConfigureStatus>;
  getConfigureJobDetails<TResource extends ProductIngestionResource = ProductIngestionResource>(
    jobId: string
  ): Promise<ProductIngestionConfigureDetail<TResource>>;
  cancelConfigure(jobId: string): Promise<ProductIngestionConfigureStatus>;
  waitForConfigureCompletion<TResource extends ProductIngestionResource = ProductIngestionResource>(
    jobId: string,
    options?: WaitForConfigureCompletionOptions
  ): Promise<ProductIngestionConfigureDetail<TResource>>;
}

export class ProductIngestionError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'ProductIngestionError';
  }
}

export class ProductIngestionJobFailedError extends ProductIngestionError {
  public readonly failures: ProductIngestionJobFailureDetail[];

  constructor(
    public readonly job: ProductIngestionConfigureStatus,
    public readonly detail?: ProductIngestionConfigureDetail
  ) {
    super(
      `Product Ingestion configure job ${job.jobId} completed with result ${job.jobResult}`,
      'configure-job',
      409,
      { job, detail }
    );
    this.name = 'ProductIngestionJobFailedError';
    this.failures = flattenJobErrors(job.errors);
  }
}

export class ProductIngestionClient implements ProductIngestionClientLike {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ProductIngestionClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? PRODUCT_INGESTION_BASE_URL);
    this.apiVersion = options.apiVersion ?? PRODUCT_INGESTION_API_VERSION;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
    this.sleep = options.sleep ?? (async (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async getResourceTree<TResource extends ProductIngestionResource = ProductIngestionResource>(
    productDurableId: string,
    targetType?: 'draft' | 'preview' | 'live'
  ): Promise<ProductIngestionResourceTreeResponse<TResource>> {
    const response = await this.request<Record<string, unknown>>('get-resource-tree', `resource-tree/${encodeDurableId(productDurableId)}`, {
      method: 'GET',
      query: targetType ? { targetType } : undefined
    });

    const resources = Array.isArray(response.resources) ? (response.resources as TResource[]) : [];
    const target = isRecord(response.target) ? { targetType: toStringOrUndefined(response.target.targetType) } : undefined;

    return {
      $schema: toStringOrUndefined(response.$schema),
      root: toStringOrUndefined(response.root) ?? productDurableId,
      target,
      resources
    };
  }

  async configure<TResource extends ProductIngestionResource = ProductIngestionResource>(
    request: ProductIngestionConfigureRequest<TResource>
  ): Promise<ProductIngestionConfigureStatus> {
    const response = await this.request<Record<string, unknown>>('configure', 'configure', {
      method: 'POST',
      body: request
    });

    return normalizeConfigureStatusResponse(response, 'configure');
  }

  async getConfigureStatus(jobId: string): Promise<ProductIngestionConfigureStatus> {
    const response = await this.request<Record<string, unknown>>('get-configure-status', `configure/${encodeURIComponent(jobId)}/status`, {
      method: 'GET'
    });

    return normalizeConfigureStatusResponse(response, jobId);
  }

  async getConfigureJobDetails<TResource extends ProductIngestionResource = ProductIngestionResource>(
    jobId: string
  ): Promise<ProductIngestionConfigureDetail<TResource>> {
    const response = await this.request<Record<string, unknown>>('get-configure-job-details', `configure/${encodeURIComponent(jobId)}`, {
      method: 'GET'
    });

    return {
      $schema: toStringOrUndefined(response.$schema),
      resources: Array.isArray(response.resources) ? (response.resources as TResource[]) : []
    };
  }

  async cancelConfigure(jobId: string): Promise<ProductIngestionConfigureStatus> {
    const response = await this.request<Record<string, unknown>>('cancel-configure', `configure/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST'
    });

    return normalizeConfigureStatusResponse(response, jobId);
  }

  async waitForConfigureCompletion<TResource extends ProductIngestionResource = ProductIngestionResource>(
    jobId: string,
    options: WaitForConfigureCompletionOptions = {}
  ): Promise<ProductIngestionConfigureDetail<TResource>> {
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    const timeoutMs = options.timeoutMs ?? 300_000;
    const startedAt = Date.now();

    for (;;) {
      const status = await this.getConfigureStatus(jobId);
      if (status.jobStatus === 'completed') {
        let detail: ProductIngestionConfigureDetail<TResource> | undefined;
        try {
          detail = await this.getConfigureJobDetails<TResource>(jobId);
        } catch (error) {
          if (status.jobResult === 'succeeded') {
            throw error;
          }
        }

        if (status.jobResult !== 'succeeded') {
          throw new ProductIngestionJobFailedError(status, detail);
        }

        return detail ?? { resources: [] };
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new ProductIngestionError(
          `Timed out waiting for Product Ingestion configure job ${jobId} to complete`,
          'wait-configure-job',
          408,
          status
        );
      }

      await this.sleep(pollIntervalMs);
    }
  }

  private async request<T>(
    action: string,
    path: string,
    options: {
      method: 'GET' | 'POST';
      query?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    url.searchParams.set('$version', this.apiVersion);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const token = await this.options.authProvider.acquireGraphToken(this.options.account, this.options.credential);
        const response = await this.fetchImpl(url, {
          method: options.method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (response.ok) {
          return (await parseResponseBody(response)) as T;
        }

        if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
          const delayMs = this.resolveRetryDelay(attempt, response.headers.get('retry-after'));
          this.options.logger.warn({ action, attempt: attempt + 1, delayMs, statusCode: response.status, url: url.toString() }, 'Retrying Product Ingestion API request');
          await this.sleep(delayMs);
          continue;
        }

        const responseBody = await parseResponseBody(response);
        this.options.logger.warn({ action, statusCode: response.status, responseBody, url: url.toString() }, 'Product Ingestion API returned a non-success response');
        throw new ProductIngestionError(
          `Product Ingestion ${action} request failed with status ${response.status}`,
          action,
          response.status,
          responseBody
        );
      } catch (error) {
        if (error instanceof ProductIngestionError) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delayMs = this.resolveRetryDelay(attempt);
          this.options.logger.warn({ action, attempt: attempt + 1, delayMs, err: error, url: url.toString() }, 'Retrying Product Ingestion API request after transport failure');
          await this.sleep(delayMs);
          continue;
        }

        this.options.logger.warn({ action, err: error, url: url.toString() }, 'Product Ingestion API request failed before receiving a response');
        throw new ProductIngestionError(`Product Ingestion ${action} request failed before receiving a response`, action, 503, error);
      }
    }

    throw new ProductIngestionError(`Product Ingestion ${action} request exhausted retries`, action, 503);
  }

  private shouldRetry(statusCode: number): boolean {
    return statusCode === 429 || statusCode >= 500;
  }

  private resolveRetryDelay(attempt: number, retryAfterHeader?: string | null): number {
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader ?? null);
    if (retryAfterMs !== undefined) {
      return Math.min(retryAfterMs, this.maxRetryDelayMs);
    }

    return Math.min(this.retryBaseDelayMs * 2 ** attempt, this.maxRetryDelayMs);
  }
}

function normalizeConfigureStatusResponse(response: Record<string, unknown>, fallbackJobId: string): ProductIngestionConfigureStatus {
  const jobId = toStringOrUndefined(response.jobId) ?? toStringOrUndefined(response.jobID) ?? fallbackJobId;

  return {
    $schema: toStringOrUndefined(response.$schema),
    jobId,
    jobStatus: toStringOrUndefined(response.jobStatus) ?? 'notStarted',
    jobResult: toStringOrUndefined(response.jobResult) ?? 'pending',
    jobStart: toStringOrUndefined(response.jobStart),
    jobEnd: toStringOrUndefined(response.jobEnd),
    resourceUri: toStringOrUndefined(response.resourceUri),
    errors: Array.isArray(response.errors)
      ? response.errors.map((error) => normalizeJobError(error)).filter((error): error is ProductIngestionJobError => Boolean(error))
      : []
  };
}

function encodeDurableId(durableId: string): string {
  return durableId
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export { ProductIngestionClient as ProductIngestionHttpClient };
