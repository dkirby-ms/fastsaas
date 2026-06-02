import { createHash } from 'node:crypto';

import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import {
  ProductIngestionError,
  ProductIngestionHttpClient,
  type ProductIngestionClientLike
} from '../lib/product-ingestion-client';
import type {
  ProductIngestionConfigureDetail,
  ProductIngestionConfigureRequest,
  ProductIngestionConfigureStatus,
  ProductIngestionJobError,
  ProductIngestionInnerError,
  ProductIngestionResource
} from '../lib/product-ingestion-types';
import type {
  MarketplaceJobErrorRecord,
  MarketplaceJobRecord,
  MarketplaceJobRepository,
  MarketplaceJobResultRecord,
  MarketplaceJobStatus
} from '../repositories/marketplace-job-repository';
import type { PartnerCenterConnectionRecord, PartnerCenterRepository } from '../repositories/partner-center-repository';
import type { PartnerCenterAuthProvider } from './partner-center-auth';
import type { PublisherActorContext } from './publisher-service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_POLL_BASE_DELAY_MS = 5_000;
const DEFAULT_POLL_MAX_DELAY_MS = 300_000;
const DEFAULT_POLL_JITTER_RATIO = 0.2;
const DEFAULT_MAX_POLL_DURATION_MS = 30 * 60 * 1000;

export interface PublisherMarketplaceJobSummary {
  id: string;
  productId?: string;
  jobId: string;
  status: MarketplaceJobStatus;
  createdAt: string;
  polledAt?: string;
  completedAt?: string;
  errorCount: number;
}

export interface PublisherMarketplaceJobDetail extends PublisherMarketplaceJobSummary {
  requestPayloadHash: string;
  latestStatus?: ProductIngestionConfigureStatus;
  result?: ProductIngestionConfigureDetail;
  errors: MarketplaceJobErrorRecord[];
}

export interface PublisherMarketplaceJobListResponse {
  jobs: PublisherMarketplaceJobSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ListPublisherMarketplaceJobsInput {
  page?: number;
  pageSize?: number;
  productId?: string;
}

export interface SubmitConfigureJobInput<TResource extends ProductIngestionResource = ProductIngestionResource> {
  productId?: string;
  request: ProductIngestionConfigureRequest<TResource>;
}

export interface JobPollingServiceOptions {
  pollBaseDelayMs?: number;
  pollMaxDelayMs?: number;
  pollJitterRatio?: number;
  maxPollDurationMs?: number;
  random?: () => number;
  now?: () => Date;
  clientFactory?: ProductIngestionClientFactory;
}

export interface ProductIngestionClientFactoryOptions {
  connection: PartnerCenterConnectionRecord;
  authProvider: PartnerCenterAuthProvider;
  logger: Logger;
}

export type ProductIngestionClientFactory = (options: ProductIngestionClientFactoryOptions) => ProductIngestionClientLike;

interface StoredPollState {
  attemptCount: number;
  nextPollAt?: string;
  lastDelayMs?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorStatus?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function flattenInnerErrors(errors: ProductIngestionInnerError[] | undefined, flattened: MarketplaceJobErrorRecord[]): void {
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

function flattenJobErrors(errors: ProductIngestionJobError[]): MarketplaceJobErrorRecord[] {
  const flattened: MarketplaceJobErrorRecord[] = [];

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

function mapRemoteStatus(status: ProductIngestionConfigureStatus, pendingStatus: MarketplaceJobStatus = 'running'): MarketplaceJobStatus {
  if (status.jobStatus !== 'completed') {
    return status.jobStatus === 'running' ? 'running' : pendingStatus;
  }

  if (status.jobResult === 'succeeded') {
    return 'completed';
  }

  if (status.jobResult === 'cancelled') {
    return 'cancelled';
  }

  if (status.jobResult === 'failed') {
    return 'failed';
  }

  return pendingStatus;
}

function isTerminalStatus(status: MarketplaceJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function getPollState(result: MarketplaceJobResultRecord | undefined): StoredPollState {
  const poll = result?.poll;
  return {
    attemptCount: typeof poll?.attemptCount === 'number' ? poll.attemptCount : 0,
    nextPollAt: typeof poll?.nextPollAt === 'string' ? poll.nextPollAt : undefined,
    lastDelayMs: typeof poll?.lastDelayMs === 'number' ? poll.lastDelayMs : undefined,
    lastErrorCode: typeof poll?.lastErrorCode === 'string' ? poll.lastErrorCode : undefined,
    lastErrorMessage: typeof poll?.lastErrorMessage === 'string' ? poll.lastErrorMessage : undefined,
    lastErrorStatus: typeof poll?.lastErrorStatus === 'number' ? poll.lastErrorStatus : undefined
  };
}

function normalizePagination(input: ListPublisherMarketplaceJobsInput): { page: number; pageSize: number; offset: number } {
  const page = input.page && input.page > 0 ? Math.floor(input.page) : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? Math.min(MAX_PAGE_SIZE, Math.floor(input.pageSize)) : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildJobSummary(job: MarketplaceJobRecord): PublisherMarketplaceJobSummary {
  return {
    id: job.id,
    productId: job.productId,
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    polledAt: job.polledAt,
    completedAt: job.completedAt,
    errorCount: job.errors.length
  };
}

function buildJobDetail(job: MarketplaceJobRecord): PublisherMarketplaceJobDetail {
  return {
    ...buildJobSummary(job),
    requestPayloadHash: job.requestPayloadHash,
    latestStatus: job.result?.latestStatus,
    result: job.result?.detail,
    errors: job.errors
  };
}

function createDefaultClientFactory(): ProductIngestionClientFactory {
  return ({ connection, authProvider, logger }) =>
    new ProductIngestionHttpClient({
      logger,
      authProvider,
      account: connection.account,
      credential: connection.credential
    });
}

async function loadDetail(client: ProductIngestionClientLike, status: ProductIngestionConfigureStatus): Promise<ProductIngestionConfigureDetail | undefined> {
  if (status.jobStatus !== 'completed') {
    return undefined;
  }

  try {
    return await client.getConfigureJobDetails(status.jobId);
  } catch (error) {
    if (status.jobResult === 'succeeded') {
      throw error;
    }

    return undefined;
  }
}

export function calculatePollDelayMs(attemptCount: number, options: Pick<JobPollingServiceOptions, 'pollBaseDelayMs' | 'pollMaxDelayMs' | 'pollJitterRatio'>, random: () => number): number {
  const baseDelay = options.pollBaseDelayMs ?? DEFAULT_POLL_BASE_DELAY_MS;
  const maxDelay = options.pollMaxDelayMs ?? DEFAULT_POLL_MAX_DELAY_MS;
  const jitterRatio = options.pollJitterRatio ?? DEFAULT_POLL_JITTER_RATIO;
  const exponentialDelay = baseDelay * Math.pow(2, Math.max(0, attemptCount - 1));
  const jitter = Math.floor(exponentialDelay * jitterRatio * random());
  return Math.min(maxDelay, exponentialDelay + jitter);
}

export class JobPollingService {
  private readonly random: () => number;
  private readonly now: () => Date;
  private readonly clientFactory: ProductIngestionClientFactory;

  constructor(
    private readonly repository: MarketplaceJobRepository,
    private readonly partnerCenterRepository: PartnerCenterRepository,
    private readonly authProvider: PartnerCenterAuthProvider,
    private readonly logger: Logger,
    private readonly options: JobPollingServiceOptions = {}
  ) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
    this.clientFactory = options.clientFactory ?? createDefaultClientFactory();
  }

  async listJobs(publisherTenantId: string, input: ListPublisherMarketplaceJobsInput = {}): Promise<PublisherMarketplaceJobListResponse> {
    const pagination = normalizePagination(input);
    const [jobs, total] = await Promise.all([
      this.repository.listByTenant(publisherTenantId, {
        limit: pagination.pageSize,
        offset: pagination.offset,
        productId: input.productId
      }),
      this.repository.countByTenant(publisherTenantId, input.productId)
    ]);

    return {
      jobs: jobs.map((job) => buildJobSummary(job)),
      page: pagination.page,
      pageSize: pagination.pageSize,
      total
    };
  }

  async getJob(publisherTenantId: string, jobId: string, productId?: string): Promise<PublisherMarketplaceJobDetail> {
    const job = await this.requireJob(publisherTenantId, jobId, productId);
    return buildJobDetail(job);
  }

  async submitConfigureJob<TResource extends ProductIngestionResource = ProductIngestionResource>(
    actor: PublisherActorContext,
    input: SubmitConfigureJobInput<TResource>
  ): Promise<PublisherMarketplaceJobDetail> {
    const client = await this.getClient(actor.tenantId);
    const submittedAt = this.now();

    try {
      const status = await client.configure(input.request);
      const detail = await loadDetail(client, status);
      const storedStatus = mapRemoteStatus(status, 'submitted');
      const created = await this.repository.createJob({
        productId: input.productId ?? null,
        publisherTenantId: actor.tenantId,
        jobId: status.jobId,
        requestPayloadHash: this.hashRequestPayload(input.request),
        status: storedStatus,
        result: {
          latestStatus: status,
          detail,
          poll: {
            attemptCount: 0
          }
        },
        errors: flattenJobErrors(status.errors),
        createdAt: submittedAt.toISOString(),
        completedAt: isTerminalStatus(storedStatus) ? (status.jobEnd ?? submittedAt.toISOString()) : null
      });

      this.logger.info(
        { actorTenantId: actor.tenantId, requestId: actor.requestId, jobId: created.jobId, status: created.status },
        'Submitted Product Ingestion configure job'
      );

      return buildJobDetail(created);
    } catch (error) {
      throw this.toAppError(error, 'submit Product Ingestion configure job');
    }
  }

  async cancelJob(actor: PublisherActorContext, jobId: string, productId?: string): Promise<PublisherMarketplaceJobDetail> {
    const existing = await this.requireJob(actor.tenantId, jobId, productId);
    if (isTerminalStatus(existing.status)) {
      throw AppError.conflict('This job is already complete and cannot be cancelled', { jobId, status: existing.status });
    }

    const client = await this.getClient(actor.tenantId);
    const polledAt = this.now();
    const pollState = getPollState(existing.result);

    try {
      const status = await client.cancelConfigure(jobId);
      const detail = await loadDetail(client, status);
      const nextStatus = mapRemoteStatus(status, 'running');
      const nextAttemptCount = pollState.attemptCount + 1;
      const nextDelayMs = isTerminalStatus(nextStatus) ? undefined : this.calculatePollDelay(nextAttemptCount);
      const updated = await this.repository.updateJob({
        id: existing.id,
        publisherTenantId: existing.publisherTenantId,
        status: nextStatus,
        result: {
          latestStatus: status,
          detail,
          poll: {
            attemptCount: nextAttemptCount,
            lastDelayMs: nextDelayMs,
            nextPollAt: nextDelayMs ? new Date(polledAt.getTime() + nextDelayMs).toISOString() : undefined
          }
        },
        errors: flattenJobErrors(status.errors),
        polledAt: polledAt.toISOString(),
        completedAt: isTerminalStatus(nextStatus) ? (status.jobEnd ?? polledAt.toISOString()) : null
      });

      this.logger.info(
        { actorTenantId: actor.tenantId, requestId: actor.requestId, jobId: updated.jobId, status: updated.status },
        'Cancelled Product Ingestion configure job'
      );

      return buildJobDetail(updated);
    } catch (error) {
      throw this.toAppError(error, 'cancel Product Ingestion configure job');
    }
  }

  async pollJob(job: MarketplaceJobRecord): Promise<MarketplaceJobRecord> {
    if (isTerminalStatus(job.status)) {
      return job;
    }

    const client = await this.getClient(job.publisherTenantId);
    const polledAt = this.now();
    const priorPollState = getPollState(job.result);
    const nextAttemptCount = priorPollState.attemptCount + 1;

    try {
      const status = await client.getConfigureStatus(job.jobId);
      const detail = await loadDetail(client, status);
      const nextStatus = mapRemoteStatus(status, job.status === 'submitted' ? 'submitted' : 'running');
      const nextDelayMs = isTerminalStatus(nextStatus) ? undefined : this.calculatePollDelay(nextAttemptCount);

      return this.repository.updateJob(
        {
          id: job.id,
          publisherTenantId: job.publisherTenantId,
          status: nextStatus,
          result: {
            latestStatus: status,
            detail,
            poll: {
              attemptCount: nextAttemptCount,
              lastDelayMs: nextDelayMs,
              nextPollAt: nextDelayMs ? new Date(polledAt.getTime() + nextDelayMs).toISOString() : undefined
            }
          },
          errors: flattenJobErrors(status.errors),
          polledAt: polledAt.toISOString(),
          completedAt: isTerminalStatus(nextStatus) ? (status.jobEnd ?? polledAt.toISOString()) : null
        },
        { bypassRls: true }
      );
    } catch (error) {
      const nextDelayMs = this.calculatePollDelay(nextAttemptCount);
      const productIngestionError = error instanceof ProductIngestionError ? error : undefined;
      const updated = await this.repository.updateJob(
        {
          id: job.id,
          publisherTenantId: job.publisherTenantId,
          result: {
            ...(job.result ?? {}),
            poll: {
              attemptCount: nextAttemptCount,
              lastDelayMs: nextDelayMs,
              nextPollAt: new Date(polledAt.getTime() + nextDelayMs).toISOString(),
              lastErrorCode: productIngestionError?.action ?? 'poll_failed',
              lastErrorMessage: error instanceof Error ? error.message : 'Polling failed',
              lastErrorStatus: productIngestionError?.statusCode
            }
          },
          polledAt: polledAt.toISOString()
        },
        { bypassRls: true }
      );

      this.logger.warn(
        {
          jobId: job.jobId,
          publisherTenantId: job.publisherTenantId,
          nextPollAt: updated.result?.poll?.nextPollAt,
          err: error
        },
        'Product Ingestion job polling attempt failed'
      );

      return updated;
    }
  }

  async markTimedOut(job: MarketplaceJobRecord): Promise<MarketplaceJobRecord> {
    const now = this.now();
    const pollState = getPollState(job.result);

    return this.repository.updateJob(
      {
        id: job.id,
        publisherTenantId: job.publisherTenantId,
        status: 'failed',
        result: {
          ...(job.result ?? {}),
          poll: {
            ...pollState,
            nextPollAt: undefined,
            lastErrorCode: 'poll_timeout',
            lastErrorMessage: `Polling exceeded ${this.getMaxPollDurationMs()}ms`
          }
        },
        errors: [
          ...job.errors,
          {
            level: 'job',
            code: 'poll_timeout',
            message: `Polling exceeded ${this.getMaxPollDurationMs()}ms`
          }
        ],
        polledAt: now.toISOString(),
        completedAt: now.toISOString()
      },
      { bypassRls: true }
    );
  }

  isPollDue(job: MarketplaceJobRecord, now: Date = this.now()): boolean {
    if (isTerminalStatus(job.status)) {
      return false;
    }

    const nextPollAt = getPollState(job.result).nextPollAt;
    if (!nextPollAt) {
      return true;
    }

    return new Date(nextPollAt).getTime() <= now.getTime();
  }

  isPollingTimedOut(job: MarketplaceJobRecord, now: Date = this.now()): boolean {
    return !isTerminalStatus(job.status) && now.getTime() - new Date(job.createdAt).getTime() >= this.getMaxPollDurationMs();
  }

  calculatePollDelay(attemptCount: number): number {
    return calculatePollDelayMs(attemptCount, this.options, this.random);
  }

  hashRequestPayload(payload: unknown): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
  }

  private getMaxPollDurationMs(): number {
    return this.options.maxPollDurationMs ?? DEFAULT_MAX_POLL_DURATION_MS;
  }

  private async requireJob(publisherTenantId: string, jobId: string, productId?: string): Promise<MarketplaceJobRecord> {
    const job = await this.repository.findByJobId(publisherTenantId, jobId);
    if (!job || (productId !== undefined && job.productId !== productId)) {
      throw AppError.notFound('The selected Product Ingestion job could not be found', { jobId, productId });
    }
 
    return job;
  }

  private async getClient(publisherTenantId: string): Promise<ProductIngestionClientLike> {
    const connection = await this.partnerCenterRepository.findByTenant(publisherTenantId);
    if (!connection) {
      throw AppError.serviceUnavailable('A connected Partner Center account is required for Product Ingestion jobs');
    }

    return this.clientFactory({
      connection,
      authProvider: this.authProvider,
      logger: this.logger.child({ component: 'product-ingestion-client', publisherTenantId })
    });
  }

  private toAppError(error: unknown, action: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof ProductIngestionError) {
      if (error.statusCode >= 500 || error.statusCode === 429) {
        return AppError.serviceUnavailable(`Unable to ${action} because Product Ingestion is temporarily unavailable`);
      }

      if (error.statusCode === 404) {
        return AppError.notFound('The requested Product Ingestion job could not be found');
      }

      return AppError.badRequest(`Unable to ${action}`);
    }

    return AppError.serviceUnavailable(`Unable to ${action}`);
  }
}

export { buildJobDetail, buildJobSummary, flattenJobErrors, isTerminalStatus };
