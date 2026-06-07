import type { Kysely } from 'kysely';

import type { Database } from '../db/database';

export interface FeatureDefinition {
  featureKey: string;
  label: string;
  description: string | null;
  category: string | null;
  createdAt: string;
}

export interface FeatureDefinitionRepository {
  listAll(): Promise<FeatureDefinition[]>;
  findByKey(featureKey: string): Promise<FeatureDefinition | null>;
}

export class InMemoryFeatureDefinitionRepository implements FeatureDefinitionRepository {
  private readonly defs = new Map<string, FeatureDefinition>();

  seed(defs: FeatureDefinition[]): void {
    for (const def of defs) {
      this.defs.set(def.featureKey, def);
    }
  }

  async listAll(): Promise<FeatureDefinition[]> {
    return [...this.defs.values()].sort((a, b) => a.featureKey.localeCompare(b.featureKey));
  }

  async findByKey(featureKey: string): Promise<FeatureDefinition | null> {
    return this.defs.get(featureKey) ?? null;
  }
}

export class KyselyFeatureDefinitionRepository implements FeatureDefinitionRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listAll(): Promise<FeatureDefinition[]> {
    const rows = await this.db
      .selectFrom('feature_definitions')
      .selectAll()
      .orderBy('feature_key', 'asc')
      .execute();

    return rows.map(toFeatureDefinition);
  }

  async findByKey(featureKey: string): Promise<FeatureDefinition | null> {
    const row = await this.db
      .selectFrom('feature_definitions')
      .selectAll()
      .where('feature_key', '=', featureKey)
      .executeTakeFirst();

    return row ? toFeatureDefinition(row) : null;
  }
}

function toFeatureDefinition(row: {
  feature_key: string;
  label: string;
  description: string | null;
  category: string | null;
  created_at: Date | string;
}): FeatureDefinition {
  return {
    featureKey: row.feature_key,
    label: row.label,
    description: row.description,
    category: row.category,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}
