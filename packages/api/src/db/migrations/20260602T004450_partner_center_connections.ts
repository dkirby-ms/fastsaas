import { sql, type Kysely } from 'kysely';

import {
  buildDisableTenantRlsStatements,
  buildEnableTenantRlsStatements,
  buildTenantIsolationPredicate,
  getTenantPolicyName
} from '../rls';

function buildPartnerCenterCredentialRlsStatements(): string[] {
  const policyName = getTenantPolicyName('partner_center_credentials');
  const predicate = buildTenantIsolationPredicate('accounts.tenant_id');

  return [
    'ALTER TABLE partner_center_credentials ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE partner_center_credentials FORCE ROW LEVEL SECURITY',
    `DROP POLICY IF EXISTS ${policyName} ON partner_center_credentials`,
    `CREATE POLICY ${policyName} ON partner_center_credentials FOR ALL USING (EXISTS (SELECT 1 FROM partner_center_accounts accounts WHERE accounts.id = partner_center_credentials.account_id AND ${predicate})) WITH CHECK (EXISTS (SELECT 1 FROM partner_center_accounts accounts WHERE accounts.id = partner_center_credentials.account_id AND ${predicate}))`
  ];
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(`
    CREATE TABLE IF NOT EXISTS partner_center_accounts (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      pc_tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      auth_mode TEXT NOT NULL CHECK (auth_mode IN ('CLIENT_SECRET', 'CLIENT_CERTIFICATE')),
      connection_status TEXT NOT NULL CHECK (connection_status IN ('PENDING', 'CONNECTED', 'FAILED', 'EXPIRED')),
      last_validated_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT partner_center_accounts_tenant_id_key UNIQUE (tenant_id)
    )
  `).execute(db);

  await sql.raw(`
    CREATE TABLE IF NOT EXISTS partner_center_credentials (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      account_id TEXT NOT NULL REFERENCES partner_center_accounts(id) ON DELETE CASCADE,
      secret_reference TEXT NOT NULL,
      rotation_metadata JSONB NULL,
      last_rotated_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT partner_center_credentials_account_id_key UNIQUE (account_id)
    )
  `).execute(db);

  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_partner_center_accounts_tenant_updated ON partner_center_accounts (tenant_id, updated_at DESC)'
  ).execute(db);
  await sql.raw(
    'CREATE INDEX IF NOT EXISTS idx_partner_center_credentials_account_updated ON partner_center_credentials (account_id, updated_at DESC)'
  ).execute(db);

  for (const statement of buildEnableTenantRlsStatements('partner_center_accounts', 'tenant_id')) {
    await sql.raw(statement).execute(db);
  }

  for (const statement of buildPartnerCenterCredentialRlsStatements()) {
    await sql.raw(statement).execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const statement of buildDisableTenantRlsStatements('partner_center_accounts')) {
    await sql.raw(statement).execute(db);
  }

  for (const statement of buildDisableTenantRlsStatements('partner_center_credentials')) {
    await sql.raw(statement).execute(db);
  }

  await sql.raw('DROP INDEX IF EXISTS idx_partner_center_credentials_account_updated').execute(db);
  await sql.raw('DROP INDEX IF EXISTS idx_partner_center_accounts_tenant_updated').execute(db);
  await sql.raw('DROP TABLE IF EXISTS partner_center_credentials').execute(db);
  await sql.raw('DROP TABLE IF EXISTS partner_center_accounts').execute(db);
}
