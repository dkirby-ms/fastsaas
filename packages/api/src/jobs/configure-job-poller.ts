import type { Logger } from 'pino';

import type { Clock } from '../metering/clock';
import type { MarketplaceJobRepository } from '../repositories/marketplace-job-repository';
import { JobPollingService } from '../services/job-polling-service';

export interface ConfigureJobPollerRunResult {
  scanned: number;
  polled: number;
  completed: number;
  failed: number;
  cancelled: number;
  timedOut: number;
}

export interface ConfigureJobPollerOptions {
  batchSize: number;
}

export class ConfigureJobPoller {
  constructor(
    private readonly repository: MarketplaceJobRepository,
    private readonly service: JobPollingService,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly options: ConfigureJobPollerOptions
  ) {}

  async runNextBatch(): Promise<ConfigureJobPollerRunResult> {
    const jobs = await this.repository.listActiveForPolling(this.options.batchSize);
    const now = this.clock.now();
    const result: ConfigureJobPollerRunResult = {
      scanned: jobs.length,
      polled: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timedOut: 0
    };

    for (const job of jobs) {
      try {
        if (this.service.isPollingTimedOut(job, now)) {
          const updated = await this.service.markTimedOut(job);
          result.timedOut += 1;
          if (updated.status === 'failed') {
            result.failed += 1;
          }
          continue;
        }

        if (!this.service.isPollDue(job, now)) {
          continue;
        }

        const updated = await this.service.pollJob(job);
        result.polled += 1;

        if (updated.status === 'completed') {
          result.completed += 1;
        } else if (updated.status === 'failed') {
          result.failed += 1;
        } else if (updated.status === 'cancelled') {
          result.cancelled += 1;
        }
      } catch (error) {
        this.logger.error({ err: error, jobId: job.jobId, publisherTenantId: job.publisherTenantId }, 'Configure job poller failed to process a job');
      }
    }

    return result;
  }
}
