import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { KyselyMarketplaceJobRepository } from '../repositories/marketplace-job-repository';
import { PostgresTestDatabase } from './postgres-test-db';

let postgres: PostgresTestDatabase;
let repository: KyselyMarketplaceJobRepository;

beforeAll(async () => {
  postgres = await PostgresTestDatabase.start();
  repository = new KyselyMarketplaceJobRepository(postgres.adminDb);
});

beforeEach(async () => {
  await sql`truncate table marketplace_jobs`.execute(postgres.adminDb);
});

afterAll(async () => {
  await postgres.destroy();
});

describe('KyselyMarketplaceJobRepository', () => {
  it('lists never-polled submitted jobs before already-polled running jobs', async () => {
    await repository.createJob({
      publisherTenantId: 'publisher-tenant',
      jobId: 'job-running',
      requestPayloadHash: 'hash-running',
      status: 'running',
      errors: [],
      createdAt: '2026-06-02T12:03:22.730Z',
      polledAt: '2026-06-02T12:04:22.730Z'
    });
    await repository.createJob({
      publisherTenantId: 'publisher-tenant',
      jobId: 'job-submitted',
      requestPayloadHash: 'hash-submitted',
      status: 'submitted',
      errors: [],
      createdAt: '2026-06-02T12:05:22.730Z',
      polledAt: null
    });

    const jobs = await repository.listActiveForPolling(2);

    expect(jobs.map((job) => ({ jobId: job.jobId, status: job.status, polledAt: job.polledAt }))).toEqual([
      {
        jobId: 'job-submitted',
        status: 'submitted',
        polledAt: undefined
      },
      {
        jobId: 'job-running',
        status: 'running',
        polledAt: '2026-06-02T12:04:22.730Z'
      }
    ]);
  });
});
