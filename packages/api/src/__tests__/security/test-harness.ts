import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Subscription, UsageEventIngestRequest } from '@fastsaas/shared';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import request from 'supertest';

import { createApp } from '../../app';
import { createConfig, type ApiConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { MarketplaceFulfillmentClient } from '../../lib/marketplace-fulfillment';
import type { ProductIngestionClientLike } from '../../lib/product-ingestion-client';
import type { ProductIngestionConfigureDetail, ProductIngestionConfigureStatus, ProductIngestionResourceTreeResponse } from '../../lib/product-ingestion-types';
import { SystemClock } from '../../metering/clock';
import { InMemoryUsageEventRepository } from '../../metering/repository';
import { InMemoryMarketplaceJobRepository } from '../../repositories/marketplace-job-repository';
import { InMemoryPartnerCenterRepository } from '../../repositories/partner-center-repository';
import { InMemoryPublisherPlanRepository } from '../../repositories/publisher-plan-repository';
import { InMemoryProductCatalogRepository } from '../../repositories/product-catalog-repository';
import { InMemorySubscriptionRepository } from '../../repositories/subscription-repository';
import { InMemoryTenantMemberRepository } from '../../repositories/tenant-member-repository';
import type { MarketplaceBearerTokenProvider } from '../../services/marketplace-oauth-service';
import type { PartnerCenterAuthProvider } from '../../services/partner-center-auth';
import { JobPollingService } from '../../services/job-polling-service';
import { PartnerCenterService } from '../../services/partner-center-service';
import { ProductCatalogService } from '../../services/product-catalog-service';
import { PublisherService } from '../../services/publisher-service';
import { SubmissionMonitoringService } from '../../services/submission-monitoring-service';
import { normalizeRbacRole } from '../../middleware/rbac';
import { SubscriptionService } from '../../services/subscription-service';
import { TenantMemberService } from '../../services/tenant-member-service';

export interface TokenOptions {
  scopes?: string[];
  roles?: string[];
  tenantId?: string;
  issuerTenantId?: string;
  tenantClaimKey?: 'tid' | 'tenant_id' | 'extension_tenant_id';
  omitTenantId?: boolean;
  userId?: string;
  subject?: string;
  omitSubject?: boolean;
  expiresIn?: string;
  audience?: string;
  issuer?: string;
  additionalClaims?: Record<string, unknown>;
  seedTenantMembership?: boolean;
}

export interface SecurityHarness {
  app: ReturnType<typeof createApp>;
  config: ApiConfig;
  meteringRepository: InMemoryUsageEventRepository;
  subscriptionRepository: InMemorySubscriptionRepository;
  tenantMemberRepository: InMemoryTenantMemberRepository;
  marketplaceJobRepository: InMemoryMarketplaceJobRepository;
  productCatalogRepository: InMemoryProductCatalogRepository;
  createToken(options?: TokenOptions): Promise<string>;
  setProductIngestionConfigureResponses(statuses: ProductIngestionConfigureStatus[]): void;
  setProductIngestionJobStatus(jobId: string, statuses: ProductIngestionConfigureStatus[]): void;
  setProductIngestionJobDetail(jobId: string, detail: ProductIngestionConfigureDetail): void;
  setProductIngestionCancelStatus(jobId: string, status: ProductIngestionConfigureStatus): void;
  setProductIngestionResourceTree(
    productDurableId: string,
    targetType: 'draft' | 'preview' | 'live',
    tree: ProductIngestionResourceTreeResponse
  ): void;
  createSubscriptionFixture(options?: {
    tenantId?: string;
    marketplaceToken?: string;
    planId?: string;
    seats?: number;
    scopes?: string[];
    roles?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Subscription>;
  close(): Promise<void>;
  ingestUsageEventFixture(options: {
    tenantId: string;
    body?: Partial<UsageEventIngestRequest>;
    scopes?: string[];
    roles?: string[];
  }): Promise<request.Response>;
}

interface FulfillmentResolveOverride {
  planId?: string;
  quantity?: number;
  beneficiaryTenantId?: string;
}

function createFulfillmentClient(overrides: Map<string, FulfillmentResolveOverride>): MarketplaceFulfillmentClient {
  return {
    async resolveSubscription(marketplaceToken: string) {
      const override = overrides.get(marketplaceToken);
      return {
        marketplaceSubscriptionId: `marketplace-${marketplaceToken}`,
        planId: override?.planId ?? 'basic',
        quantity: override?.quantity ?? 5,
        offerId: 'offer-basic',
        purchaserTenantId: `purchaser-${marketplaceToken}`,
        beneficiaryTenantId: override?.beneficiaryTenantId ?? `beneficiary-${marketplaceToken}`,
        metadata: {
          fixture: 'security-suite'
        }
      };
    },
    async activateSubscription() {},
    async suspendSubscription() {},
    async unsubscribeSubscription() {},
    async updateSubscription() {},
    async reinstateSubscription() {},
    async getOperation() {
      throw new Error('getOperation should not be called in security tests');
    },
    async updateOperationStatus() {
      throw new Error('updateOperationStatus should not be called in security tests');
    }
  };
}

function buildUsageEvent(body: Partial<UsageEventIngestRequest> = {}): UsageEventIngestRequest {
  return {
    eventId: body.eventId ?? `event-${randomUUID()}`,
    subscriptionId: body.subscriptionId ?? `subscription-${randomUUID()}`,
    planId: body.planId ?? 'basic',
    dimensionId: body.dimensionId ?? 'api-calls',
    quantity: body.quantity ?? 1,
    timestamp: body.timestamp ?? new Date().toISOString(),
    idempotencyKey: body.idempotencyKey,
    metadata: body.metadata
  };
}

function createPartnerCenterAuthProvider(): PartnerCenterAuthProvider {
  return {
    async acquireGraphToken() {
      return 'partner-center-test-token';
    },
    async validateConnection() {
      return {
        organizationId: 'partner-center-org',
        displayName: 'Partner Center Test Org'
      };
    },
    invalidate() {}
  };
}

function createMarketplaceTokenProvider(): MarketplaceBearerTokenProvider {
  return {
    async getAccessToken() {
      return 'marketplace-oauth-test-token';
    },
    invalidate() {}
  };
}

interface ProductIngestionFixtureState {
  configureResponses: ProductIngestionConfigureStatus[];
  statuses: Map<string, ProductIngestionConfigureStatus[]>;
  details: Map<string, ProductIngestionConfigureDetail>;
  cancelStatuses: Map<string, ProductIngestionConfigureStatus>;
  resourceTrees: Map<string, ProductIngestionResourceTreeResponse>;
}

function createResourceTreeKey(productDurableId: string, targetType: 'draft' | 'preview' | 'live' | undefined): string {
  return `${productDurableId}::${targetType ?? 'draft'}`;
}

function createProductIngestionClient(state: ProductIngestionFixtureState): ProductIngestionClientLike {
  return {
    async getProductByExternalId() {
      throw new Error('getProductByExternalId should not be called in security tests');
    },
    async getResourceTree(productDurableId: string, targetType?: 'draft' | 'preview' | 'live') {
      const tree = state.resourceTrees.get(createResourceTreeKey(productDurableId, targetType));
      if (!tree) {
        throw new Error(`No Product Ingestion resource tree fixture registered for ${productDurableId} (${targetType ?? 'draft'})`);
      }

      return tree;
    },
    async configure() {
      if (state.configureResponses.length === 0) {
        throw new Error('No Product Ingestion configure response fixture registered');
      }

      if (state.configureResponses.length > 1) {
        return state.configureResponses.shift() as ProductIngestionConfigureStatus;
      }

      return state.configureResponses[0] as ProductIngestionConfigureStatus;
    },
    async getConfigureStatus(jobId: string) {
      const statuses = state.statuses.get(jobId);
      if (!statuses || statuses.length === 0) {
        throw new Error(`No Product Ingestion status fixture registered for ${jobId}`);
      }

      if (statuses.length > 1) {
        return statuses.shift() as ProductIngestionConfigureStatus;
      }

      return statuses[0] as ProductIngestionConfigureStatus;
    },
    async getConfigureJobDetails(jobId: string) {
      return state.details.get(jobId) ?? { resources: [] };
    },
    async cancelConfigure(jobId: string) {
      return state.cancelStatuses.get(jobId) ?? {
        jobId,
        jobStatus: 'completed',
        jobResult: 'cancelled',
        errors: []
      };
    },
    async waitForConfigureCompletion() {
      throw new Error('waitForConfigureCompletion should not be called in security tests');
    }
  };
}

export async function createSecurityHarness(): Promise<SecurityHarness> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = (await exportJWK(publicKey)) as JWK;

  jwk.alg = 'RS256';
  jwk.kid = 'security-suite-key-1';
  jwk.use = 'sig';

  const jwksServer = createServer((req, res) => {
    if (req.url !== '/discovery/v2.0/keys') {
      res.statusCode = 404;
      res.end();
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => {
    jwksServer.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = jwksServer.address() as AddressInfo;
  const config = createConfig({
    API_PORT: '3001',
    NODE_ENV: 'test',
    ENTRA_TENANT_ID: 'tenant-security-home',
    ENTRA_CLIENT_ID: 'fastsaas-security-tests-client',
    ENTRA_AUDIENCE: 'api://fastsaas-security-tests',
    ENTRA_ISSUER: 'https://login.microsoftonline.com/tenant-security-home/v2.0',
    ENTRA_JWKS_URI: `http://127.0.0.1:${port}/discovery/v2.0/keys`,
    JWT_REQUIRED_SCOPE: 'api:read',
    METERING_READ_SCOPE: 'metering:read',
    METERING_WRITE_SCOPE: 'metering:write'
  });

  const meteringRepository = new InMemoryUsageEventRepository(new SystemClock());
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const tenantMemberRepository = new InMemoryTenantMemberRepository();
  const publisherPlanRepository = new InMemoryPublisherPlanRepository();
  const partnerCenterRepository = new InMemoryPartnerCenterRepository();
  const marketplaceJobRepository = new InMemoryMarketplaceJobRepository();
  const productCatalogRepository = new InMemoryProductCatalogRepository();
  const fulfillmentOverrides = new Map<string, FulfillmentResolveOverride>();
  const productIngestionState: ProductIngestionFixtureState = {
    configureResponses: [],
    statuses: new Map(),
    details: new Map(),
    cancelStatuses: new Map(),
    resourceTrees: new Map()
  };
  const tenantMemberService = new TenantMemberService(tenantMemberRepository, logger.child({ component: 'tenant-members-test' }));
  const subscriptionService = new SubscriptionService(
    subscriptionRepository,
    createFulfillmentClient(fulfillmentOverrides),
    logger,
    tenantMemberService
  );
  const publisherService = new PublisherService(
    subscriptionRepository,
    publisherPlanRepository,
    logger.child({ component: 'publisher-test' })
  );
  const partnerCenterAuthProvider = createPartnerCenterAuthProvider();
  const marketplaceTokenProvider = createMarketplaceTokenProvider();
  const partnerCenterService = new PartnerCenterService(
    partnerCenterRepository,
    partnerCenterAuthProvider,
    logger.child({ component: 'partner-center-test' })
  );
  const jobPollingService = new JobPollingService(
    marketplaceJobRepository,
    partnerCenterRepository,
    partnerCenterAuthProvider,
    logger.child({ component: 'job-polling-test' }),
    { clientFactory: () => createProductIngestionClient(productIngestionState), random: () => 0, tokenProvider: marketplaceTokenProvider }
  );
  const productCatalogService = new ProductCatalogService({
    repository: productCatalogRepository,
    partnerCenterRepository,
    authProvider: partnerCenterAuthProvider,
    tokenProvider: marketplaceTokenProvider,
    logger: logger.child({ component: 'product-catalog-test' })
  });
  const submissionMonitoringService = new SubmissionMonitoringService({
    repository: productCatalogRepository,
    partnerCenterRepository,
    authProvider: partnerCenterAuthProvider,
    tokenProvider: marketplaceTokenProvider,
    logger: logger.child({ component: 'submission-monitoring-test' }),
    clientFactory: () => createProductIngestionClient(productIngestionState)
  });
  const app = createApp(config, {
    repository: meteringRepository,
    subscriptionRepository,
    subscriptionService,
    publisherService,
    partnerCenterService,
    jobPollingService,
    productCatalogService,
    submissionMonitoringService,
    tenantMemberService
  });

  async function createToken(options: TokenOptions = {}): Promise<string> {
    const tenantId = options.tenantId ?? config.auth.azureTenantId;
    const tenantClaimKey = options.tenantClaimKey ?? 'tenant_id';
    const userId = options.userId ?? 'user-123';
    const roles = options.roles ?? ['Member'];
    const payload: Record<string, unknown> = {
      roles,
      oid: options.omitSubject ? undefined : userId,
      ...options.additionalClaims
    };

    if (!options.omitTenantId) {
      if (tenantClaimKey === 'tid') {
        payload.tid = tenantId;
      } else {
        if (options.issuerTenantId) {
          payload.tid = options.issuerTenantId;
        }

        payload[tenantClaimKey] = tenantId;
      }
    }

    if (options.scopes === undefined) {
      payload.scp = config.auth.requiredScope;
    } else if (options.scopes.length > 0) {
      payload.scp = options.scopes.join(' ');
    }

    const membershipRole = roles.map((role) => normalizeRbacRole(role)).find((role): role is NonNullable<typeof role> => role !== null);
    if ((options.seedTenantMembership ?? true) && !options.omitTenantId && membershipRole) {
      await tenantMemberRepository.upsertByTenantAndUserId({
        tenantId,
        userId,
        email: `${userId}@example.com`,
        role: membershipRole
      });
    }

    let token = new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'security-suite-key-1' })
      .setIssuer(options.issuer ?? config.auth.issuer)
      .setAudience(options.audience ?? config.auth.audience[0])
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '10m');

    if (!options.omitSubject) {
      token = token.setSubject(options.subject ?? 'subject-123');
    }

    return token.sign(privateKey as KeyLike);
  }

  async function createSubscriptionFixture(
    options: {
      tenantId?: string;
      marketplaceToken?: string;
      planId?: string;
      seats?: number;
      scopes?: string[];
      roles?: string[];
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<Subscription> {
    const tenantId = options.tenantId ?? config.auth.azureTenantId;
    const userId = 'user-123';
    const marketplaceToken = options.marketplaceToken ?? `fixture-${randomUUID()}`;
    fulfillmentOverrides.set(marketplaceToken, {
      planId: options.planId,
      quantity: options.seats,
      beneficiaryTenantId: tenantId
    });

    try {
      return await subscriptionService.subscribe({
        tenantId,
        userId,
        userEmail: `${userId}@example.com`,
        requestId: `fixture-${randomUUID()}`,
        correlationId: `fixture-${randomUUID()}`,
        source: 'api',
        marketplaceToken,
        metadata: {
          fixture: 'security-suite',
          ...(options.metadata ?? {})
        }
      });
    } finally {
      fulfillmentOverrides.delete(marketplaceToken);
    }
  }

  async function ingestUsageEventFixture(options: {
    tenantId: string;
    body?: Partial<UsageEventIngestRequest>;
    scopes?: string[];
    roles?: string[];
  }): Promise<request.Response> {
    const token = await createToken({
      tenantId: options.tenantId,
      scopes: options.scopes ?? [config.metering.writeScope],
      roles: options.roles ?? ['Admin']
    });

    return request(app)
      .post('/v1/metering/events')
      .set('Authorization', `Bearer ${token}`)
      .send(buildUsageEvent(options.body));
  }

  return {
    app,
    config,
    meteringRepository,
    subscriptionRepository,
    tenantMemberRepository,
    marketplaceJobRepository,
    productCatalogRepository,
    createToken,
    setProductIngestionConfigureResponses(statuses) {
      productIngestionState.configureResponses = [...statuses];
    },
    setProductIngestionJobStatus(jobId, statuses) {
      productIngestionState.statuses.set(jobId, [...statuses]);
    },
    setProductIngestionJobDetail(jobId, detail) {
      productIngestionState.details.set(jobId, detail);
    },
    setProductIngestionCancelStatus(jobId, status) {
      productIngestionState.cancelStatuses.set(jobId, status);
    },
    setProductIngestionResourceTree(productDurableId, targetType, tree) {
      productIngestionState.resourceTrees.set(createResourceTreeKey(productDurableId, targetType), tree);
    },
    createSubscriptionFixture,
    ingestUsageEventFixture,
    async close() {
      await new Promise<void>((resolve, reject) => {
        jwksServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
