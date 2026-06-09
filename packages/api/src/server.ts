import type { Server } from 'node:http';

import type { Kysely } from 'kysely';
import type { Pool } from 'pg';

import { createApp } from './app';
import { createConfig } from './config';
import { createDatabase, createPool, type Database } from './db/database';
import { runWithSystemExecutionContext } from './db/execution-context';
import { migrateToLatest } from './db/migrator';
import { PgPoolSqlClient } from './db/sql-client-adapter';
import { MARKETPLACE_FULFILLMENT_TOKEN_SCOPE, MarketplaceFulfillmentHttpClient } from './lib/marketplace-fulfillment';
import { logger } from './lib/logger';
import { SystemClock } from './metering/clock';
import { createMeteringRuntime } from './metering/runtime';
import {
  InMemoryAuditLogRepository,
  KyselyAuditLogRepository,
  type AuditLogRepository
} from './repositories/audit-log-repository';
import {
  InMemoryMarketplaceJobRepository,
  KyselyMarketplaceJobRepository,
  type MarketplaceJobRepository
} from './repositories/marketplace-job-repository';
import {
  InMemoryPlanFeatureGateRepository,
  KyselyPlanFeatureGateRepository,
  type PlanFeatureGateRepository
} from './repositories/plan-feature-gate-repository';
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
import { ConfigureJobPoller } from './jobs/configure-job-poller';
import { AuditService } from './services/audit-service';
import { AssetVisibilityService } from './services/asset-visibility-service';
import { DefaultPlanFeatureGateService } from './services/plan-feature-gate-service';
import { JobPollingService } from './services/job-polling-service';
import { MarketplaceOAuthService } from './services/marketplace-oauth-service';
import { ProductCatalogService } from './services/product-catalog-service';
import { PublisherService } from './services/publisher-service';
import { SubmissionMonitoringService } from './services/submission-monitoring-service';
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

function createMarketplaceJobRepository(database?: Kysely<Database>): MarketplaceJobRepository {
  return database ? new KyselyMarketplaceJobRepository(database) : new InMemoryMarketplaceJobRepository();
}

function createPlanFeatureGateRepository(database?: Kysely<Database>): PlanFeatureGateRepository {
  return database ? new KyselyPlanFeatureGateRepository(database) : new InMemoryPlanFeatureGateRepository();
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
  const marketplaceJobRepository = createMarketplaceJobRepository(database);
  const productCatalogRepository = createProductCatalogRepository(database);
  const planFeatureGateRepository = createPlanFeatureGateRepository(database);
  const marketplaceFulfillmentOAuthService = new MarketplaceOAuthService({
    logger: logger.child({ component: 'marketplace-fulfillment-oauth' }),
    marketplace: {
      ...config.marketplace,
      tokenScope: MARKETPLACE_FULFILLMENT_TOKEN_SCOPE
    }
  });
  const fulfillmentClient = new MarketplaceFulfillmentHttpClient({
    baseUrl: config.marketplace.baseUrl,
    apiVersion: config.marketplace.apiVersion,
    tokenProvider: marketplaceFulfillmentOAuthService,
    logger
  });
  const tenantMemberService = new TenantMemberService(tenantMemberRepository, logger.child({ component: 'tenant-members' }));
  const subscriptionService = new SubscriptionService(subscriptionRepository, fulfillmentClient, logger, tenantMemberService);
  const auditService = new AuditService(auditLogRepository, logger.child({ component: 'audit' }));
  const marketplaceOAuthService = new MarketplaceOAuthService({
    logger: logger.child({ component: 'marketplace-oauth' }),
    marketplace: config.marketplace
  });
  const jobPollingService = new JobPollingService(marketplaceJobRepository, undefined, logger.child({ component: 'job-polling' }), {
    pollBaseDelayMs: config.jobPolling.pollBaseDelayMs,
    pollMaxDelayMs: config.jobPolling.pollMaxDelayMs,
    pollJitterRatio: config.jobPolling.pollJitterRatio,
    maxPollDurationMs: config.jobPolling.maxPollDurationMs,
    tokenProvider: marketplaceOAuthService
  });
  const configureJobPoller = new ConfigureJobPoller(
    marketplaceJobRepository,
    jobPollingService,
    new SystemClock(),
    logger.child({ component: 'configure-job-poller' }),
    { batchSize: config.jobPolling.batchSize }
  );
  const publisherService = new PublisherService(
    subscriptionRepository,
    publisherPlanRepository,
    logger.child({ component: 'operator' })
  );
  const productCatalogService = new ProductCatalogService({
    repository: productCatalogRepository,
    tokenProvider: marketplaceOAuthService,
    logger: logger.child({ component: 'product-catalog' })
  });
  const submissionMonitoringService = new SubmissionMonitoringService({
    repository: productCatalogRepository,
    tokenProvider: marketplaceOAuthService,
    logger: logger.child({ component: 'submission-monitoring' })
  });
  const assetVisibilityService = new AssetVisibilityService({
    repository: productCatalogRepository,
    tokenProvider: marketplaceOAuthService,
    logger: logger.child({ component: 'asset-visibility' })
  });
  const planFeatureGateService = new DefaultPlanFeatureGateService(planFeatureGateRepository, subscriptionRepository);
  const app = createApp(config, {
    ...meteringRuntime,
    subscriptionRepository,
    subscriptionService,
    auditService,
    publisherService,
    publisherPlanRepository,
    jobPollingService,
    productCatalogService,
    submissionMonitoringService,
    assetVisibilityService,
    planFeatureGateService,
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

  async function runConfigureJobPoller(): Promise<void> {
    try {
      const result = await runWithSystemExecutionContext(() => configureJobPoller.runNextBatch());
      if (result.scanned > 0) {
        logger.info(result, 'Completed configure job polling batch');
      }
    } catch (error) {
      logger.error({ err: error }, 'Configure job poller run failed');
    }
  }

  const meteringWorkerInterval = setInterval(() => {
    void runMeteringWorker();
  }, config.metering.workerIntervalMs);
  meteringWorkerInterval.unref();

  const configureJobPollerInterval = setInterval(() => {
    void runConfigureJobPoller();
  }, config.jobPolling.workerIntervalMs);
  configureJobPollerInterval.unref();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API server listening');
  });

  registerShutdownHandlers(server, database, meteringPool, [meteringWorkerInterval, configureJobPollerInterval]);
}

function registerShutdownHandlers(
  server: Server,
  database?: Kysely<Database>,
  meteringPool?: Pool,
  workerIntervals: Array<ReturnType<typeof setInterval> | undefined> = []
): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const workerInterval of workerIntervals) {
      if (workerInterval) {
        clearInterval(workerInterval);
      }
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
