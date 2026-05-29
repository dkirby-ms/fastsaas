import { createApp } from './app';
import { createConfig } from './config';
import { MarketplaceFulfillmentHttpClient } from './lib/marketplace-fulfillment';
import { logger } from './lib/logger';
import { createMeteringRuntime } from './metering/runtime';
import {
  InMemorySubscriptionRepository,
  PrismaSubscriptionRepository,
  type SubscriptionRepository
} from './repositories/subscription-repository';
import { SubscriptionService } from './services/subscription-service';

function createSubscriptionRepository(databaseUrl?: string): SubscriptionRepository {
  return databaseUrl ? new PrismaSubscriptionRepository() : new InMemorySubscriptionRepository();
}

const config = createConfig();
const meteringRuntime = createMeteringRuntime(config);
const subscriptionRepository = createSubscriptionRepository(config.databaseUrl);
const fulfillmentClient = new MarketplaceFulfillmentHttpClient({
  baseUrl: config.marketplace.baseUrl,
  apiVersion: config.marketplace.apiVersion,
  authToken: config.marketplace.authToken,
  logger
});
const subscriptionService = new SubscriptionService(subscriptionRepository, fulfillmentClient, logger);
const app = createApp(config, { ...meteringRuntime, subscriptionService });

async function runMeteringWorker(): Promise<void> {
  try {
    const result = await meteringRuntime.worker.runNextBatch();
    if (result.attempted > 0) {
      logger.info(result, 'Completed metering outbox batch');
    }
  } catch (error) {
    logger.error({ err: error }, 'Metering worker run failed');
  }
}

setInterval(() => {
  void runMeteringWorker();
}, config.metering.workerIntervalMs).unref();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API server listening');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  server.close(() => {
    subscriptionRepository.disconnect?.().catch((error) => {
      logger.error({ err: error }, 'Error disconnecting subscription repository');
      process.exitCode = 1;
    });
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
