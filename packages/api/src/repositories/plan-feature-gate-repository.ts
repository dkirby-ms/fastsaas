import type { Kysely } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export interface StoredFeatureGate {
  publisherTenantId: string;
  planId: string;
  featureKey: string;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface UpsertFeatureGateInput {
  publisherTenantId: string;
  planId: string;
  featureKey: string;
  enabled: boolean;
  metadata?: unknown;
}

export interface PlanFeatureGateRepository {
  listByPlan(publisherTenantId: string, planId: string): Promise<StoredFeatureGate[]>;
  findEnabledByPlanAndKey(planId: string, featureKey: string): Promise<StoredFeatureGate | null>;
  upsertMany(gates: UpsertFeatureGateInput[]): Promise<void>;
  remove(publisherTenantId: string, planId: string, featureKey: string): Promise<void>;
}

export class InMemoryPlanFeatureGateRepository implements PlanFeatureGateRepository {
  private readonly gates = new Map<string, StoredFeatureGate>();

  private key(publisherTenantId: string, planId: string, featureKey: string): string {
    return `${publisherTenantId}:${planId}:${featureKey}`;
  }

  async listByPlan(publisherTenantId: string, planId: string): Promise<StoredFeatureGate[]> {
    return [...this.gates.values()].filter(
      (gate) => gate.publisherTenantId === publisherTenantId && gate.planId === planId
    );
  }

  async findEnabledByPlanAndKey(planId: string, featureKey: string): Promise<StoredFeatureGate | null> {
    const match = [...this.gates.values()].find(
      (gate) => gate.planId === planId && gate.featureKey === featureKey && gate.enabled
    );
    return match ?? null;
  }

  async upsertMany(gates: UpsertFeatureGateInput[]): Promise<void> {
    const now = new Date().toISOString();
    for (const input of gates) {
      const k = this.key(input.publisherTenantId, input.planId, input.featureKey);
      const existing = this.gates.get(k);
      this.gates.set(k, {
        publisherTenantId: input.publisherTenantId,
        planId: input.planId,
        featureKey: input.featureKey,
        enabled: input.enabled,
        metadata: (input.metadata as Record<string, unknown> | null | undefined) ?? null,
        createdAt: existing?.createdAt ?? now
      });
    }
  }

  async remove(publisherTenantId: string, planId: string, featureKey: string): Promise<void> {
    this.gates.delete(this.key(publisherTenantId, planId, featureKey));
  }
}

export class KyselyPlanFeatureGateRepository implements PlanFeatureGateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listByPlan(publisherTenantId: string, planId: string): Promise<StoredFeatureGate[]> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const rows = await trx
          .selectFrom('plan_feature_gates')
          .selectAll()
          .where('publisher_tenant_id', '=', publisherTenantId)
          .where('plan_id', '=', planId)
          .orderBy('feature_key', 'asc')
          .execute();

        return rows.map((row) => ({
          publisherTenantId: row.publisher_tenant_id,
          planId: row.plan_id,
          featureKey: row.feature_key,
          enabled: row.enabled,
          metadata: row.metadata,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
        }));
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async findEnabledByPlanAndKey(planId: string, featureKey: string): Promise<StoredFeatureGate | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const row = await trx
          .selectFrom('plan_feature_gates')
          .selectAll()
          .where('plan_id', '=', planId)
          .where('feature_key', '=', featureKey)
          .where('enabled', '=', true)
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        return {
          publisherTenantId: row.publisher_tenant_id,
          planId: row.plan_id,
          featureKey: row.feature_key,
          enabled: row.enabled,
          metadata: row.metadata,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
        };
      },
      { bypassRls: true, scope: 'system' }
    );
  }

  async upsertMany(gates: UpsertFeatureGateInput[]): Promise<void> {
    if (gates.length === 0) {
      return;
    }

    const publisherTenantId = gates[0].publisherTenantId;

    await withDatabaseRlsContext(
      this.db,
      async (trx) => {
        for (const gate of gates) {
          await trx
            .insertInto('plan_feature_gates')
            .values({
              publisher_tenant_id: gate.publisherTenantId,
              plan_id: gate.planId,
              feature_key: gate.featureKey,
              enabled: gate.enabled,
              metadata: gate.metadata != null ? (gate.metadata as Record<string, unknown>) : null
            })
            .onConflict((oc) =>
              oc.columns(['publisher_tenant_id', 'plan_id', 'feature_key']).doUpdateSet({
                enabled: gate.enabled,
                metadata: gate.metadata != null ? (gate.metadata as Record<string, unknown>) : null
              })
            )
            .execute();
        }
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async remove(publisherTenantId: string, planId: string, featureKey: string): Promise<void> {
    await withDatabaseRlsContext(
      this.db,
      async (trx) => {
        await trx
          .deleteFrom('plan_feature_gates')
          .where('publisher_tenant_id', '=', publisherTenantId)
          .where('plan_id', '=', planId)
          .where('feature_key', '=', featureKey)
          .execute();
      },
      { tenantId: publisherTenantId, bypassRls: false, scope: 'tenant' }
    );
  }
}
