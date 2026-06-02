import type { Server } from 'node:http';

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
  InMemoryAuditLogRepository,
  KyselyAuditLogRepository,
  type AuditLogRepository
} from './repositories/audit-log-repository';
import {
  InMemoryPartnerCenterRepository,
  KyselyPartnerCenterRepository,
  type PartnerCenterRepository
} from './repositories/partner-center-repository';
import {
  InMemoryPublisherPlanRepository,
  KyselyPublisherPlanRepository,
  type PublisherPlanRepository
} from './repositories/publisher-plan-repository';
import {
  InMemoryProductCatalogRepository,
  KyselyProductCatalogRepository,
  type ProductCatalogRepository
} from './repositories/product-catalog-repository';
import {
  InMemorySubscriptionRepository,
  KyselySubscriptionRepository,
  type SubscriptionRepository
} from './repositories/subscription-repository';
import {
  InMemoryTenantMemberRepository,
  KyselyTenantMemberRepository,
  type TenantMemberRepository
} from './repositories/tenant-member-repository';
import { AuditService } from './services/audit-service';
import { PartnerCenterAuthService } from './services/partner-center-auth';
import { PartnerCenterService } from './services/partner-center-service';
import { ProductCatalogService } from './services/product-catalog-service';
import { PublisherService } from './services/publisher-service';
import { SubscriptionService } from './services/subscription-service';
import { TenantMemberService } from './services/tenant-member-service';

function createSubscriptionRepository(database?: Kysely<Database>): SubscriptionRepository {
  return database ? new KyselySubscriptionRepository(database) : new InMemorySubscriptionRepository();
}

function createAuditLogRepository(database?: Kysely<Database>): AuditLogRepository {
  return database ? new KyselyAuditLogRepository(database) : new InMemoryAuditLogRepository();
}

function createPublisherPlanRepository(database?: Kysely<Database>): PublisherPlanRepository {
  return database ? new KyselyPublisherPlanRepository(database) : new InMemoryPublisherPlanRepository();
}

function createTenantMemberRepository(database?: Kysely<Database>): TenantMemberRepository {
  return database ? new KyselyTenantMemberRepository(database) : new InMemoryTenantMemberRepository();
}

function createPartnerCenterRepository(database?: Kysely<Database>): PartnerCenterRepository {
  return database ? new KyselyPartnerCenterRepository(database) : new InMemoryPartnerCenterRepository();
}

function createProductCatalogRepository(database?: Kysely<Database>): ProductCatalogRepository {
  return database ? new KyselyProductCatalogRepository(database) : new InMemoryProductCatalogRepository();
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
  let meteringPool: Pool | undefined;

  try {
    await migrateToLatest(database, logger.child({ component: 'db-migrate' }));
    meteringPool = createPool(databaseUrl);

    return {
      database,
      meteringPool,
      meteringSqlClient: new PgPoolSqlClient(meteringPool)
    };
  } catch (error) {
    const cleanupTasks = [database.destroy(), meteringPool?.end()].filter((task): task is Promise<void> => Boolean(task));
    await Promise.allSettled(cleanupTasks);
    logger.error({ err: error }, 'Failed to initialize database clients or run migrations');
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
  const tenantMemberRepository = createTenantMemberRepository(database);
  const partnerCenterRepository = createPartnerCenterRepository(database);
  const productCatalogRepository = createProductCatalogRepository(database);
  const fulfillmentClient = new MarketplaceFulfillmentHttpClient({
    baseUrl: config.marketplace.baseUrl,
    apiVersion: config.marketplace.apiVersion,
    authToken: config.marketplace.authToken,
    logger
  });
  const tenantMemberService = new TenantMemberService(tenantMemberRepository, logger.child({ component: 'tenant-members' }));
  const subscriptionService = new SubscriptionService(subscriptionRepository, fulfillmentClient, logger, tenantMemberService);
  const auditService = new AuditService(auditLogRepository, logger.child({ component: 'audit' }));
  const partnerCenterAuthService = new PartnerCenterAuthService({
    logger: logger.child({ component: 'partner-center-auth' }),
    keyVaultUrl: process.env.AZURE_KEY_VAULT_URL,
    allowEnvironmentSecretReferences: (process.env.NODE_ENV ?? 'development') !== 'production'
  });
  const partnerCenterService = new PartnerCenterService(
    partnerCenterRepository,
    partnerCenterAuthService,
    logger.child({ component: 'partner-center' })
  );
  const publisherService = new PublisherService(
    subscriptionRepository,
    publisherPlanRepository,
    logger.child({ component: 'publisher' })
  );
  const productCatalogService = new ProductCatalogService({
    repository: productCatalogRepository,
    partnerCenterRepository,
    authProvider: partnerCenterAuthService,
    logger: logger.child({ component: 'product-catalog' })
  });
  const app = createApp(config, {
    ...meteringRuntime,
    subscriptionRepository,
    subscriptionService,
    auditService,
    publisherService,
    partnerCenterService,
    productCatalogService,
    tenantMemberService
  });

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

  registerShutdownHandlers(server, database, meteringPool, meteringWorkerInterval);
}

function registerShutdownHandlers(
  server: Server,
  database?: Kysely<Database>,
  meteringPool?: Pool,
  meteringWorkerInterval?: ReturnType<typeof setInterval>
): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    if (meteringWorkerInterval) {
      clearInterval(meteringWorkerInterval);
    }

    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => {
      void (async () => {
        const cleanupTasks = [database?.destroy(), meteringPool?.end()].filter((task): task is Promise<void> => Boolean(task));
        const results = await Promise.allSettled(cleanupTasks);

        for (const result of results) {
          if (result.status === 'rejected') {
            logger.error({ err: result.reason }, 'Error shutting down database resources');
            process.exitCode = 1;
          }
        }
      })();
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start API server');
  process.exit(1);
});
