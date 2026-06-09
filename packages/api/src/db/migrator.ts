import { Migrator, type Kysely, type Migration, type MigrationProvider, type MigrationResultSet } from 'kysely';
import type { Logger } from 'pino';

import type { Database } from './database';
import * as coreTablesMigration from './migrations/20260604T000000_core_tables';
import * as auditLogsMigration from './migrations/20260531T213532_audit_logs';
import * as tenantRlsMigration from './migrations/20260531T213532_tenant_rls';
import * as publisherPlansMigration from './migrations/20260601T004305_publisher_plans';
import * as tenantMembersMigration from './migrations/20260601T205004_tenant_members';
import * as partnerCenterConnectionsMigration from './migrations/20260602T004450_partner_center_connections';
import * as marketplaceCatalogMigration from './migrations/20260602T120322_marketplace_catalog';
import * as marketplaceJobsMigration from './migrations/20260602T120322_marketplace_jobs';
import * as publisherPlansMarketplaceLinkMigration from './migrations/20260606T150000_publisher_plans_marketplace_link';
import * as planFeatureGatesMigration from './migrations/20260606T210000_plan_feature_gates';
import * as removePriceMonthlyMigration from './migrations/20260606T212300_remove_price_monthly';
import * as featureDefinitionsMigration from './migrations/20260607T154900_feature_definitions';
import * as seedPremium1DarkModeMigration from './migrations/20260607T180000_seed_premium1_dark_mode';
import * as publisherPlansArchivedStatusMigration from './migrations/20260608T132240_publisher_plans_archived_status';
import * as seedDataProcessingFeatureMigration from './migrations/20260609T120000_seed_data_processing_feature';
import * as removeDarkModeFeatureMigration from './migrations/20260609T131900_remove_dark_mode_feature';

const MIGRATIONS: Record<string, Migration> = {
  '20260531T213532_audit_logs': auditLogsMigration,
  '20260531T213532_tenant_rls': tenantRlsMigration,
  '20260601T004305_publisher_plans': publisherPlansMigration,
  '20260601T205004_tenant_members': tenantMembersMigration,
  '20260602T004450_partner_center_connections': partnerCenterConnectionsMigration,
  '20260602T120322_marketplace_catalog': marketplaceCatalogMigration,
  '20260602T120322_marketplace_jobs': marketplaceJobsMigration,
  '20260604T000000_core_tables': coreTablesMigration,
  '20260606T150000_publisher_plans_marketplace_link': publisherPlansMarketplaceLinkMigration,
  '20260606T210000_plan_feature_gates': planFeatureGatesMigration,
  '20260606T212300_remove_price_monthly': removePriceMonthlyMigration,
  '20260607T154900_feature_definitions': featureDefinitionsMigration,
  '20260607T180000_seed_premium1_dark_mode': seedPremium1DarkModeMigration,
  '20260608T132240_publisher_plans_archived_status': publisherPlansArchivedStatusMigration,
  '20260609T120000_seed_data_processing_feature': seedDataProcessingFeatureMigration,
  '20260609T131900_remove_dark_mode_feature': removeDarkModeFeatureMigration
};

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS;
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new StaticMigrationProvider()
  });
}

export async function migrateToLatest(db: Kysely<Database>, migrationLogger?: Logger): Promise<MigrationResultSet> {
  const migrator = createMigrator(db);
  const result = await migrator.migrateToLatest();

  for (const migration of result.results ?? []) {
    migrationLogger?.info({ migration: migration.migrationName, status: migration.status }, 'Database migration executed');
  }

  if (result.error) {
    migrationLogger?.error({ err: result.error }, 'Database migration failed');
    throw result.error;
  }

  return result;
}

export const runMigrations = migrateToLatest;
