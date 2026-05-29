import { PrismaClient } from '@prisma/client';

import type { ApiConfig } from '../config';
import { HttpMarketplaceMeteringClient, type MarketplaceMeteringClient } from './client';
import { type Clock, SystemClock } from './clock';
import { PostgresUsageEventRepository } from './postgres-repository';
import { InMemoryUsageEventRepository, type UsageEventRepository } from './repository';
import { MeteringService } from './service';
import { MeteringOutboxWorker } from './worker';

export interface MeteringRuntimeDependencies {
  clock?: Clock;
  repository?: UsageEventRepository;
  marketplaceClient?: MarketplaceMeteringClient;
  random?: () => number;
}

function createDefaultRepository(config: ApiConfig, clock: Clock): UsageEventRepository {
  if (config.database.url) {
    return new PostgresUsageEventRepository(new PrismaClient());
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required to initialize the PostgreSQL metering outbox repository');
  }

  return new InMemoryUsageEventRepository(clock);
}

export function createMeteringRuntime(config: ApiConfig, dependencies: MeteringRuntimeDependencies = {}) {
  const clock = dependencies.clock ?? new SystemClock();
  const repository = dependencies.repository ?? createDefaultRepository(config, clock);
  const marketplaceClient = dependencies.marketplaceClient ?? new HttpMarketplaceMeteringClient(
    config.metering.marketplaceEndpoint,
    config.metering.marketplaceApiKey
  );

  return {
    clock,
    repository,
    marketplaceClient,
    service: new MeteringService(config, repository, clock),
    worker: new MeteringOutboxWorker(config, repository, marketplaceClient, clock, dependencies.random)
  };
}
