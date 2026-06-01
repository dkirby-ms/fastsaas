import type { Server } from 'node:http';

import type { Kysely } from 'kysely';
import type { Pool } from 'pg';

import { createApp } from './app';
import { createConfig } from './config';
import { createDatabase, createPool, type Database } from './db/database';
import { migrateToLatest } from './db/migrator';
import { PgPoolSqlClient } from './db/sql-client-adapter';
import { MarketplaceFulfillmentHttpClient } from './lib/marketplace-fulfillment';
import { logger } from './lib/logger';
import { createMeteringRuntime } from './metering/runtime';
import {
  InMemoryAuditLogRepository,
  KyselyAuditLogRepository,
  type AuditLogRepository
} from './repositories/audit-log-repository';
import {
  InMemoryPublisherPlanRepository,
  KyselyPublisherPlanRepository,
  type PublisherPlanRepository
} from './repositories/publisher-plan-repository';
import {
  InMemorySubscriptionRepository,
  KyselySubscriptionRepository,
  type SubscriptionRepository
} from './repositories/subscription-repository';
import { AuditService } from './services/audit-service';
import { PublisherService } from './services/publisher-service';
import { SubscriptionService } from './services/subscription-service';

function createSubscriptionRepository(database?: Kysely<Database>): SubscriptionRepository {
  return database ? new KyselySubscriptionRepository(database) : new InMemorySubscriptionRepository();
}

function createAuditLogRepository(database?: Kysely<Database>): AuditLogRepository {
  return database ? new KyselyAuditLogRepository(database) : new InMemoryAuditLogRepository();
}

function createPublisherPlanRepository(database?: Kysely<Database>): PublisherPlanRepository {
  return database ? new KyselyPublisherPlanRepository(database) : new InMemoryPublisherPlanRepository();
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

  try {
    await migrateToLatest(database, logger.child({ component: 'db-migrate' }));
    const meteringPool = createPool(databaseUrl);

    return {
      database,
      meteringPool,
      meteringSqlClient: new PgPoolSqlClient(meteringPool)
    };
  } catch (error) {
    await database.destroy().catch(() => undefined);
    logger.error({ err: error }, 'Failed to initialize database clients');
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const config = createConfig();
  const { database, meteringPool, meteringSqlClient } = await initializeDatabaseDependencies(config.databaseUrl);
  const meteringRuntime = createMeteringRuntime(config, meteringSqlClient ? { sqlClient: meteringSqlClient } : {});
  const subscriptionRepository = createSubscriptionRepository(database);
  const auditLogRepository = createAuditLogRepository(database);
  const publisherPlanRepository = createPublisherPlanRepository(database);
  const fulfillmentClient = new MarketplaceFulfillmentHttpClient({
    baseUrl: config.marketplace.baseUrl,
    apiVersion: config.marketplace.apiVersion,
    authToken: config.marketplace.authToken,
    logger
  });
  const subscriptionService = new SubscriptionService(subscriptionRepository, fulfillmentClient, logger);
  const auditService = new AuditService(auditLogRepository, logger.child({ component: 'audit' }));
  const publisherService = new PublisherService(
    subscriptionRepository,
    publisherPlanRepository,
    logger.child({ component: 'publisher' })
  );
  const app = createApp(config, { ...meteringRuntime, subscriptionService, auditService, publisherService });

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

  registerShutdownHandlers(server, database, meteringPool);
}

function registerShutdownHandlers(server: Server, database?: Kysely<Database>, meteringPool?: Pool): void {
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
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start API server');
  process.exit(1);
});
