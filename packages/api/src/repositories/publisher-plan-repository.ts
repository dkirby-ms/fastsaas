import type { PublisherPlanStatus } from '@fastsaas/shared';
import type { Kysely, Selectable } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export interface StoredPublisherPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  status: PublisherPlanStatus;
  features: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SavePublisherPlanInput {
  publisherTenantId: string;
  id: string;
  name: string;
  description: string;
  priceMonthly: string;
  status: PublisherPlanStatus;
  features: string[];
}

export interface PublisherPlanRepository {
  listByTenant(publisherTenantId: string): Promise<StoredPublisherPlan[]>;
  savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan>;
}

type PublisherPlanRow = Selectable<Database['publisher_plans']>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asFeatures(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function mapPlan(row: PublisherPlanRow): StoredPublisherPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceMonthly: row.price_monthly,
    status: row.status,
    features: asFeatures(row.features),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString()
  };
}

export class InMemoryPublisherPlanRepository implements PublisherPlanRepository {
  private readonly plansByTenant = new Map<string, Map<string, StoredPublisherPlan>>();

  async listByTenant(publisherTenantId: string): Promise<StoredPublisherPlan[]> {
    return [...(this.plansByTenant.get(publisherTenantId)?.values() ?? [])]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((plan) => clone(plan));
  }

  async savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan> {
    const now = new Date().toISOString();
    const tenantPlans = this.plansByTenant.get(input.publisherTenantId) ?? new Map<string, StoredPublisherPlan>();
    const existing = tenantPlans.get(input.id);
    const stored: StoredPublisherPlan = {
      id: input.id,
      name: input.name,
      description: input.description,
      priceMonthly: input.priceMonthly,
      status: input.status,
      features: clone(input.features),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    tenantPlans.set(input.id, stored);
    this.plansByTenant.set(input.publisherTenantId, tenantPlans);
    return clone(stored);
  }
}

export class KyselyPublisherPlanRepository implements PublisherPlanRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listByTenant(publisherTenantId: string): Promise<StoredPublisherPlan[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('publisher_plans')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .orderBy('name', 'asc')
          .execute();

        return rows.map((row) => mapPlan(row));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        await trx
          .insertInto('publisher_plans')
          .values({
            publisher_tenant_id: input.publisherTenantId,
            id: input.id,
            name: input.name,
            description: input.description,
            price_monthly: input.priceMonthly,
            status: input.status,
            features: input.features
          })
          .onConflict((oc) =>
            oc.columns(['publisher_tenant_id', 'id']).doUpdateSet({
              name: input.name,
              description: input.description,
              price_monthly: input.priceMonthly,
              status: input.status,
              features: input.features,
              updated_at: new Date()
            })
          )
          .execute();

        const row = await trx
          .selectFrom('publisher_plans')
          .selectAll()
          .where('publisher_tenant_id', '=', input.publisherTenantId)
          .where('id', '=', input.id)
          .executeTakeFirstOrThrow();

        return mapPlan(row);
      },
      { tenantId: input.publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }
}
