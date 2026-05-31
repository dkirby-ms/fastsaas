import type { Kysely } from 'kysely';

import { createApp } from './app';
import { createConfig } from './config';
import { createDatabase, createPool, type Database } from './db/database';
import { PgPoolSqlClient } from './db/sql-client-adapter';
import { MarketplaceFulfillmentHttpClient } from './lib/marketplace-fulfillment';
import { logger } from './lib/logger';
import { createMeteringRuntime } from './metering/runtime';
import {
  InMemorySubscriptionRepository,
  KyselySubscriptionRepository,
  type SubscriptionRepository
} from './repositories/subscription-repository';
import { SubscriptionService } from './services/subscription-service';

function createSubscriptionRepository(database?: Kysely<Database>): SubscriptionRepository {
  return database ? new KyselySubscriptionRepository(database) : new InMemorySubscriptionRepository();
}

const config = createConfig();
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const meteringPool = config.databaseUrl ? createPool(config.databaseUrl) : undefined;
const meteringSqlClient = meteringPool ? new PgPoolSqlClient(meteringPool) : undefined;
const meteringRuntime = createMeteringRuntime(config, meteringSqlClient ? { sqlClient: meteringSqlClient } : {});
const subscriptionRepository = createSubscriptionRepository(database);
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

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, 'Shutdown signal received');
  server.close(async () => {
    const cleanupTasks = [database?.destroy(), meteringPool?.end()].filter(
      (task): task is Promise<void> => Boolean(task)
    );
    const results = await Promise.allSettled(cleanupTasks);

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error({ err: result.reason }, 'Error shutting down database resources');
        process.exitCode = 1;
      }
    }
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
