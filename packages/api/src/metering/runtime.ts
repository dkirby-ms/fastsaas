import type { ApiConfig } from '../config';
import { HttpMarketplaceMeteringClient, type MarketplaceMeteringClient } from './client';
import { type Clock, SystemClock } from './clock';
import { InMemoryUsageEventRepository, type UsageEventRepository } from './repository';
import { MeteringService } from './service';
import { MeteringOutboxWorker } from './worker';

export interface MeteringRuntimeDependencies {
  clock?: Clock;
  repository?: UsageEventRepository;
  marketplaceClient?: MarketplaceMeteringClient;
  random?: () => number;
}

export function createMeteringRuntime(config: ApiConfig, dependencies: MeteringRuntimeDependencies = {}) {
  const clock = dependencies.clock ?? new SystemClock();
  const repository = dependencies.repository ?? new InMemoryUsageEventRepository(clock);
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
