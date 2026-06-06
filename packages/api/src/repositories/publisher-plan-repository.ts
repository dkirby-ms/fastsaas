import type { PublisherPlanStatus } from '@fastsaas/shared';
import type { Kysely, Selectable } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export interface StoredPublisherPlan {
  id: string;
  name: string;
  description: string;
  pricingSummary: Record<string, unknown> | null;
  status: PublisherPlanStatus;
  features: string[];
  marketplacePlanId: string | null;
  seatLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavePublisherPlanInput {
  publisherTenantId: string;
  id: string;
  name: string;
  description: string;
  status: PublisherPlanStatus;
  features: string[];
  marketplacePlanId?: string | null;
  seatLimit?: number | null;
}

export interface PublisherPlanRepository {
  listByTenant(publisherTenantId: string): Promise<StoredPublisherPlan[]>;
  findByMarketplacePlanId(marketplacePlanId: string): Promise<StoredPublisherPlan | null>;
  savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan>;
}

type PublisherPlanRow = Selectable<Database['publisher_plans']>;

interface PlanListRow extends PublisherPlanRow {
  pricing_summary: Record<string, unknown> | null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asFeatures(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function mapPlan(row: PublisherPlanRow | PlanListRow, pricingSummary: Record<string, unknown> | null = null): StoredPublisherPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pricingSummary: 'pricing_summary' in row ? (row as PlanListRow).pricing_summary : pricingSummary,
    status: row.status,
    features: asFeatures(row.features),
    marketplacePlanId: row.marketplace_plan_id,
    seatLimit: row.seat_limit,
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

  async findByMarketplacePlanId(marketplacePlanId: string): Promise<StoredPublisherPlan | null> {
    for (const tenantPlans of this.plansByTenant.values()) {
      const match = [...tenantPlans.values()].find((plan) => plan.marketplacePlanId === marketplacePlanId);
      if (match) {
        return clone(match);
      }
    }

    return null;
  }

  async savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan> {
    const now = new Date().toISOString();
    const tenantPlans = this.plansByTenant.get(input.publisherTenantId) ?? new Map<string, StoredPublisherPlan>();
    const existing = tenantPlans.get(input.id);
    const marketplacePlanId = input.marketplacePlanId ?? null;
    const seatLimit = input.seatLimit ?? null;

    if (marketplacePlanId) {
      for (const [tenantId, plans] of this.plansByTenant.entries()) {
        const duplicate = [...plans.values()].find(
          (plan) =>
            plan.marketplacePlanId === marketplacePlanId &&
            !(tenantId === input.publisherTenantId && plan.id === input.id)
        );

        if (duplicate) {
          throw Object.assign(new Error('duplicate marketplace_plan_id'), { code: '23505' });
        }
      }
    }

    const stored: StoredPublisherPlan = {
      id: input.id,
      name: input.name,
      description: input.description,
      pricingSummary: null,
      status: input.status,
      features: clone(input.features),
      marketplacePlanId,
      seatLimit,
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
          .leftJoin('marketplace_plans', (join) =>
            join
              .onRef('publisher_plans.marketplace_plan_id', '=', 'marketplace_plans.external_plan_id')
              .onRef('publisher_plans.publisher_tenant_id', '=', 'marketplace_plans.publisher_tenant_id')
          )
          .select([
            'publisher_plans.id',
            'publisher_plans.name',
            'publisher_plans.description',
            'publisher_plans.status',
            'publisher_plans.features',
            'publisher_plans.marketplace_plan_id',
            'publisher_plans.seat_limit',
            'publisher_plans.created_at',
            'publisher_plans.updated_at',
            'marketplace_plans.pricing_summary'
          ])
          .where('publisher_plans.publisher_tenant_id', '=', publisherTenantId)
          .orderBy('publisher_plans.name', 'asc')
          .execute();

        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          pricingSummary: row.pricing_summary,
          status: row.status,
          features: asFeatures(row.features),
          marketplacePlanId: row.marketplace_plan_id,
          seatLimit: row.seat_limit,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString()
        }));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async findByMarketplacePlanId(marketplacePlanId: string): Promise<StoredPublisherPlan | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const row = await trx
          .selectFrom('publisher_plans')
          .selectAll()
          .where('marketplace_plan_id', '=', marketplacePlanId)
          .executeTakeFirst();

        return row ? mapPlan(row) : null;
      },
      { bypassRls: true, scope: 'system' }
    );
  }

  async savePlan(input: SavePublisherPlanInput): Promise<StoredPublisherPlan> {
    const marketplacePlanId = input.marketplacePlanId ?? null;
    const seatLimit = input.seatLimit ?? null;

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
            status: input.status,
            features: input.features,
            marketplace_plan_id: marketplacePlanId,
            seat_limit: seatLimit
          })
          .onConflict((oc) =>
            oc.columns(['publisher_tenant_id', 'id']).doUpdateSet({
              name: input.name,
              description: input.description,
              status: input.status,
              features: input.features,
              marketplace_plan_id: marketplacePlanId,
              seat_limit: seatLimit,
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
