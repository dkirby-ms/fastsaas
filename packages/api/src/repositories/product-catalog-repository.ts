import { randomUUID } from 'node:crypto';

import type { Kysely, Selectable, Transaction } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export interface StoredMarketplaceProduct {
  id: string;
  publisherTenantId: string;
  externalOfferId: string;
  durableProductId: string;
  productType: string;
  alias: string;
  lifecycleState?: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketplacePlan {
  id: string;
  publisherTenantId: string;
  productId: string;
  externalPlanId: string;
  durablePlanId: string;
  status: string;
  pricingSummary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketplaceSubmission {
  id: string;
  publisherTenantId: string;
  productId: string;
  durableSubmissionId: string;
  targetType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketplaceResource {
  id: string;
  publisherTenantId: string;
  productId: string;
  resourceType: string;
  durableId: string;
  jsonSnapshot: Record<string, unknown>;
  schemaVersion: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMarketplaceProductDetail {
  product: StoredMarketplaceProduct;
  plans: StoredMarketplacePlan[];
  submissions: StoredMarketplaceSubmission[];
}

export interface ReplaceMarketplaceCatalogSnapshotInput {
  publisherTenantId: string;
  existingProductId?: string;
  product: {
    externalOfferId: string;
    durableProductId: string;
    productType: string;
    alias: string;
    lifecycleState?: string;
  };
  plans: Array<{
    externalPlanId: string;
    durablePlanId: string;
    status: string;
    pricingSummary?: Record<string, unknown>;
  }>;
  submissions: Array<{
    durableSubmissionId: string;
    targetType: string;
    status: string;
  }>;
  resources: Array<{
    resourceType: string;
    durableId: string;
    jsonSnapshot: Record<string, unknown>;
    schemaVersion: string;
    environment: string;
  }>;
  syncedAt: string;
}

export interface ProductCatalogRepository {
  listProducts(publisherTenantId: string): Promise<StoredMarketplaceProduct[]>;
  listAllPlans(publisherTenantId: string): Promise<StoredMarketplacePlan[]>;
  getProductById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProduct | null>;
  getProductDetailById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProductDetail | null>;
  listResourcesByProductId(publisherTenantId: string, productId: string): Promise<StoredMarketplaceResource[]>;
  replaceCatalogSnapshot(input: ReplaceMarketplaceCatalogSnapshotInput): Promise<StoredMarketplaceProductDetail>;
}

type MarketplaceProductRow = Selectable<Database['marketplace_products']>;
type MarketplacePlanRow = Selectable<Database['marketplace_plans']>;
type MarketplaceSubmissionRow = Selectable<Database['marketplace_submissions']>;
type MarketplaceResourceRow = Selectable<Database['marketplace_resources']>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function mapProduct(row: MarketplaceProductRow): StoredMarketplaceProduct {
  return {
    id: row.id,
    publisherTenantId: row.publisher_tenant_id,
    externalOfferId: row.external_offer_id,
    durableProductId: row.durable_product_id,
    productType: row.product_type,
    alias: row.alias,
    lifecycleState: row.lifecycle_state ?? undefined,
    lastSyncedAt: toIsoString(row.last_synced_at) as string,
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

function mapPlan(row: MarketplacePlanRow): StoredMarketplacePlan {
  return {
    id: row.id,
    publisherTenantId: row.publisher_tenant_id,
    productId: row.product_id,
    externalPlanId: row.external_plan_id,
    durablePlanId: row.durable_plan_id,
    status: row.status,
    pricingSummary: asRecord(row.pricing_summary),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

function mapSubmission(row: MarketplaceSubmissionRow): StoredMarketplaceSubmission {
  return {
    id: row.id,
    publisherTenantId: row.publisher_tenant_id,
    productId: row.product_id,
    durableSubmissionId: row.durable_submission_id,
    targetType: row.target_type,
    status: row.status,
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

function mapResource(row: MarketplaceResourceRow): StoredMarketplaceResource {
  return {
    id: row.id,
    publisherTenantId: row.publisher_tenant_id,
    productId: row.product_id,
    resourceType: row.resource_type,
    durableId: row.durable_id,
    jsonSnapshot: clone(row.json_snapshot),
    schemaVersion: row.schema_version,
    environment: row.environment,
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

async function loadProductDetail(trx: Transaction<Database>, publisherTenantId: string, productId: string): Promise<StoredMarketplaceProductDetail | null> {
  const productRow = await trx
    .selectFrom('marketplace_products')
    .selectAll()
    .where('publisher_tenant_id', '=', publisherTenantId)
    .where('id', '=', productId)
    .executeTakeFirst();

  if (!productRow) {
    return null;
  }

  const [planRows, submissionRows] = await Promise.all([
    trx
      .selectFrom('marketplace_plans')
      .selectAll()
      .where('publisher_tenant_id', '=', publisherTenantId)
      .where('product_id', '=', productId)
      .orderBy('external_plan_id', 'asc')
      .execute(),
    trx
      .selectFrom('marketplace_submissions')
      .selectAll()
      .where('publisher_tenant_id', '=', publisherTenantId)
      .where('product_id', '=', productId)
      .orderBy('target_type', 'asc')
      .orderBy('durable_submission_id', 'asc')
      .execute()
  ]);

  return {
    product: mapProduct(productRow),
    plans: planRows.map((row) => mapPlan(row)),
    submissions: submissionRows.map((row) => mapSubmission(row))
  };
}

async function findExistingProductRow(
  trx: Transaction<Database>,
  publisherTenantId: string,
  existingProductId: string | undefined,
  durableProductId: string,
  externalOfferId: string
): Promise<MarketplaceProductRow | undefined> {
  if (existingProductId) {
    const byId = await trx
      .selectFrom('marketplace_products')
      .selectAll()
      .where('publisher_tenant_id', '=', publisherTenantId)
      .where('id', '=', existingProductId)
      .executeTakeFirst();

    if (byId) {
      return byId;
    }
  }

  const byDurableId = await trx
    .selectFrom('marketplace_products')
    .selectAll()
    .where('publisher_tenant_id', '=', publisherTenantId)
    .where('durable_product_id', '=', durableProductId)
    .executeTakeFirst();

  if (byDurableId) {
    return byDurableId;
  }

  return trx
    .selectFrom('marketplace_products')
    .selectAll()
    .where('publisher_tenant_id', '=', publisherTenantId)
    .where('external_offer_id', '=', externalOfferId)
    .executeTakeFirst();
}

export class InMemoryProductCatalogRepository implements ProductCatalogRepository {
  private readonly productsByTenant = new Map<string, Map<string, StoredMarketplaceProduct>>();
  private readonly plansByProduct = new Map<string, StoredMarketplacePlan[]>();
  private readonly submissionsByProduct = new Map<string, StoredMarketplaceSubmission[]>();
  private readonly resourcesByProduct = new Map<string, StoredMarketplaceResource[]>();

  async listProducts(publisherTenantId: string): Promise<StoredMarketplaceProduct[]> {
    return [...(this.productsByTenant.get(publisherTenantId)?.values() ?? [])]
      .sort((left, right) => left.alias.localeCompare(right.alias))
      .map((product) => clone(product));
  }

  async listAllPlans(publisherTenantId: string): Promise<StoredMarketplacePlan[]> {
    const tenantProducts = this.productsByTenant.get(publisherTenantId);
    if (!tenantProducts) {
      return [];
    }

    return [...tenantProducts.values()]
      .sort((left, right) => left.alias.localeCompare(right.alias))
      .flatMap((product) =>
        clone(this.plansByProduct.get(product.id) ?? []).sort((left, right) => left.externalPlanId.localeCompare(right.externalPlanId))
      );
  }

  async getProductById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProduct | null> {
    return clone(this.productsByTenant.get(publisherTenantId)?.get(productId) ?? null);
  }

  async getProductDetailById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProductDetail | null> {
    const product = this.productsByTenant.get(publisherTenantId)?.get(productId);
    if (!product) {
      return null;
    }

    return {
      product: clone(product),
      plans: clone(this.plansByProduct.get(productId) ?? []),
      submissions: clone(this.submissionsByProduct.get(productId) ?? [])
    };
  }

  async listResourcesByProductId(publisherTenantId: string, productId: string): Promise<StoredMarketplaceResource[]> {
    const product = this.productsByTenant.get(publisherTenantId)?.get(productId);
    if (!product) {
      return [];
    }

    return clone(this.resourcesByProduct.get(productId) ?? []);
  }

  async replaceCatalogSnapshot(input: ReplaceMarketplaceCatalogSnapshotInput): Promise<StoredMarketplaceProductDetail> {
    const now = input.syncedAt;
    const tenantProducts = this.productsByTenant.get(input.publisherTenantId) ?? new Map<string, StoredMarketplaceProduct>();
    const existing = [...tenantProducts.values()].find(
      (product) =>
        (input.existingProductId ? product.id === input.existingProductId : false) ||
        product.durableProductId === input.product.durableProductId ||
        product.externalOfferId === input.product.externalOfferId
    );
    const productId = existing?.id ?? randomUUID();
    const storedProduct: StoredMarketplaceProduct = {
      id: productId,
      publisherTenantId: input.publisherTenantId,
      externalOfferId: input.product.externalOfferId,
      durableProductId: input.product.durableProductId,
      productType: input.product.productType,
      alias: input.product.alias,
      lifecycleState: input.product.lifecycleState,
      lastSyncedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    tenantProducts.set(productId, storedProduct);
    this.productsByTenant.set(input.publisherTenantId, tenantProducts);

    this.plansByProduct.set(
      productId,
      input.plans.map((plan) => ({
        id: randomUUID(),
        publisherTenantId: input.publisherTenantId,
        productId,
        externalPlanId: plan.externalPlanId,
        durablePlanId: plan.durablePlanId,
        status: plan.status,
        pricingSummary: plan.pricingSummary ? clone(plan.pricingSummary) : undefined,
        createdAt: now,
        updatedAt: now
      }))
    );
    this.submissionsByProduct.set(
      productId,
      input.submissions.map((submission) => ({
        id: randomUUID(),
        publisherTenantId: input.publisherTenantId,
        productId,
        durableSubmissionId: submission.durableSubmissionId,
        targetType: submission.targetType,
        status: submission.status,
        createdAt: now,
        updatedAt: now
      }))
    );
    this.resourcesByProduct.set(
      productId,
      input.resources.map((resource) => ({
        id: randomUUID(),
        publisherTenantId: input.publisherTenantId,
        productId,
        resourceType: resource.resourceType,
        durableId: resource.durableId,
        jsonSnapshot: clone(resource.jsonSnapshot),
        schemaVersion: resource.schemaVersion,
        environment: resource.environment,
        createdAt: now,
        updatedAt: now
      }))
    );

    return {
      product: clone(storedProduct),
      plans: clone(this.plansByProduct.get(productId) ?? []),
      submissions: clone(this.submissionsByProduct.get(productId) ?? [])
    };
  }
}

export class KyselyProductCatalogRepository implements ProductCatalogRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listProducts(publisherTenantId: string): Promise<StoredMarketplaceProduct[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('marketplace_products')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .orderBy('alias', 'asc')
          .execute();

        return rows.map((row) => mapProduct(row));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async listAllPlans(publisherTenantId: string): Promise<StoredMarketplacePlan[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('marketplace_plans')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .orderBy('product_id', 'asc')
          .orderBy('external_plan_id', 'asc')
          .execute();

        return rows.map((row) => mapPlan(row));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async getProductById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProduct | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const row = await trx
          .selectFrom('marketplace_products')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .where('id', '=', productId)
          .executeTakeFirst();

        return row ? mapProduct(row) : null;
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async getProductDetailById(publisherTenantId: string, productId: string): Promise<StoredMarketplaceProductDetail | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => loadProductDetail(trx, publisherTenantId, productId),
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async listResourcesByProductId(publisherTenantId: string, productId: string): Promise<StoredMarketplaceResource[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('marketplace_resources')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .where('product_id', '=', productId)
          .orderBy('created_at', 'asc')
          .orderBy('resource_type', 'asc')
          .orderBy('durable_id', 'asc')
          .execute();

        return rows.map((row) => mapResource(row));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async replaceCatalogSnapshot(input: ReplaceMarketplaceCatalogSnapshotInput): Promise<StoredMarketplaceProductDetail> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const syncedAt = new Date(input.syncedAt);
        const existing = await findExistingProductRow(
          trx,
          input.publisherTenantId,
          input.existingProductId,
          input.product.durableProductId,
          input.product.externalOfferId
        );

        const productRow = existing
          ? await trx
              .updateTable('marketplace_products')
              .set({
                external_offer_id: input.product.externalOfferId,
                durable_product_id: input.product.durableProductId,
                product_type: input.product.productType,
                alias: input.product.alias,
                lifecycle_state: input.product.lifecycleState ?? null,
                last_synced_at: syncedAt,
                updated_at: syncedAt
              })
              .where('publisher_tenant_id', '=', input.publisherTenantId)
              .where('id', '=', existing.id)
              .returningAll()
              .executeTakeFirstOrThrow()
          : await trx
              .insertInto('marketplace_products')
              .values({
                id: randomUUID(),
                publisher_tenant_id: input.publisherTenantId,
                external_offer_id: input.product.externalOfferId,
                durable_product_id: input.product.durableProductId,
                product_type: input.product.productType,
                alias: input.product.alias,
                lifecycle_state: input.product.lifecycleState ?? null,
                last_synced_at: syncedAt,
                created_at: syncedAt,
                updated_at: syncedAt
              })
              .returningAll()
              .executeTakeFirstOrThrow();

        await Promise.all([
          trx.deleteFrom('marketplace_plans').where('publisher_tenant_id', '=', input.publisherTenantId).where('product_id', '=', productRow.id).execute(),
          trx.deleteFrom('marketplace_submissions').where('publisher_tenant_id', '=', input.publisherTenantId).where('product_id', '=', productRow.id).execute(),
          trx.deleteFrom('marketplace_resources').where('publisher_tenant_id', '=', input.publisherTenantId).where('product_id', '=', productRow.id).execute()
        ]);

        if (input.plans.length > 0) {
          await trx
            .insertInto('marketplace_plans')
            .values(
              input.plans.map((plan) => ({
                id: randomUUID(),
                publisher_tenant_id: input.publisherTenantId,
                product_id: productRow.id,
                external_plan_id: plan.externalPlanId,
                durable_plan_id: plan.durablePlanId,
                status: plan.status,
                pricing_summary: plan.pricingSummary ?? null,
                created_at: syncedAt,
                updated_at: syncedAt
              }))
            )
            .execute();
        }

        if (input.submissions.length > 0) {
          await trx
            .insertInto('marketplace_submissions')
            .values(
              input.submissions.map((submission) => ({
                id: randomUUID(),
                publisher_tenant_id: input.publisherTenantId,
                product_id: productRow.id,
                durable_submission_id: submission.durableSubmissionId,
                target_type: submission.targetType,
                status: submission.status,
                created_at: syncedAt,
                updated_at: syncedAt
              }))
            )
            .execute();
        }

        if (input.resources.length > 0) {
          await trx
            .insertInto('marketplace_resources')
            .values(
              input.resources.map((resource) => ({
                id: randomUUID(),
                publisher_tenant_id: input.publisherTenantId,
                product_id: productRow.id,
                resource_type: resource.resourceType,
                durable_id: resource.durableId,
                json_snapshot: resource.jsonSnapshot,
                schema_version: resource.schemaVersion,
                environment: resource.environment,
                created_at: syncedAt,
                updated_at: syncedAt
              }))
            )
            .execute();
        }

        return (await loadProductDetail(trx, input.publisherTenantId, productRow.id)) as StoredMarketplaceProductDetail;
      },
      { tenantId: input.publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }
}
