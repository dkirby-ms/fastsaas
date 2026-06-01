import type { Kysely } from 'kysely';
import type { Pool } from 'pg';

import { createApp } from './app';
import { createConfig } from './config';
import { createDatabase, createPool, type Database } from './db/database';
import { runWithSystemExecutionContext } from './db/execution-context';
import { migrateToLatest } from './db/migrator';
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

async function initializeDatabaseDependencies(databaseUrl?: string): Promise<{
  database?: Kysely<Database>;
  meteringPool?: Pool;
  meteringSqlClient?: PgPoolSqlClient;
}> {
  if (!databaseUrl) {
    logger.warn('DATABASE_URL is not configured; starting API in degraded mode');
    return {};
  }

  const database = createDatabase(databaseUrl);
  const meteringPool = createPool(databaseUrl);

  try {
    const result = await migrateToLatest(database);

    for (const migration of result.results ?? []) {
      logger.info({ migration: migration.migrationName, status: migration.status }, 'Database migration result');
    }

    return {
      database,
      meteringPool,
      meteringSqlClient: new PgPoolSqlClient(meteringPool)
    };
  } catch (error) {
    await Promise.allSettled([database.destroy(), meteringPool.end()]);
    logger.error({ err: error }, 'Failed to initialize database clients or run migrations');
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const config = createConfig();
  const { database, meteringPool, meteringSqlClient } = await initializeDatabaseDependencies(config.databaseUrl);
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
      const result = await runWithSystemExecutionContext(() => meteringRuntime.worker.runNextBatch());
      if (result.attempted > 0) {
        logger.info(result, 'Completed metering outbox batch');
      }
    } catch (error) {
      logger.error({ err: error }, 'Metering worker run failed');
    }
  }

  const meteringWorkerInterval = setInterval(() => {
    void runMeteringWorker();
  }, config.metering.workerIntervalMs);
  meteringWorkerInterval.unref();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API server listening');
  });

  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearInterval(meteringWorkerInterval);
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
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, 'API server failed to start');
  process.exitCode = 1;
});
