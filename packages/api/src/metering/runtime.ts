import { createPool } from '../db/database';
import { PgPoolSqlClient } from '../db/sql-client-adapter';
import type { ApiConfig } from '../config';
import { HttpMarketplaceMeteringClient, type MarketplaceMeteringClient } from './client';
import { type Clock, SystemClock } from './clock';
import { PostgresUsageEventRepository, type PostgresUsageEventSqlClient } from './postgres-repository';
import { InMemoryUsageEventRepository, type UsageEventRepository } from './repository';
import { MeteringService } from './service';
import { MeteringOutboxWorker } from './worker';

export interface MeteringRuntimeDependencies {
  clock?: Clock;
  repository?: UsageEventRepository;
  marketplaceClient?: MarketplaceMeteringClient;
  random?: () => number;
  sqlClient?: PostgresUsageEventSqlClient;
}

function createDefaultRepository(
  config: ApiConfig,
  clock: Clock,
  sqlClient?: PostgresUsageEventSqlClient
): UsageEventRepository {
  if (config.database.url) {
    return new PostgresUsageEventRepository(sqlClient ?? new PgPoolSqlClient(createPool(config.database.url)));
  }

  return new InMemoryUsageEventRepository(clock);
}

export function createMeteringRuntime(config: ApiConfig, dependencies: MeteringRuntimeDependencies = {}) {
  const clock = dependencies.clock ?? new SystemClock();
  const repository = dependencies.repository ?? createDefaultRepository(config, clock, dependencies.sqlClient);
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
