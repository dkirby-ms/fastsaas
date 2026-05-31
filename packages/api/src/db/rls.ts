import { APP_BYPASS_RLS_SETTING, APP_CURRENT_TENANT_SETTING } from './execution-context';

export interface TenantScopedTablePolicy {
  tableName: string;
  tenantColumn: string;
}

export const TENANT_SCOPED_TABLE_POLICIES: readonly TenantScopedTablePolicy[] = [
  { tableName: 'subscriptions', tenantColumn: 'tenant_id' },
  { tableName: 'subscription_audit_logs', tenantColumn: 'tenant_id' },
  { tableName: 'usage_events', tenantColumn: 'tenant_id' },
  { tableName: 'usage_event_dead_letters', tenantColumn: 'tenant_id' },
  { tableName: 'marketplace_webhook_events', tenantColumn: 'tenant_id' }
] as const;

export function buildTenantIsolationPredicate(tenantColumn: string): string {
  const tenantSetting = `NULLIF(current_setting('${APP_CURRENT_TENANT_SETTING}', true), '')`;
  const bypassSetting = `COALESCE(NULLIF(current_setting('${APP_BYPASS_RLS_SETTING}', true), ''), 'false') = 'true'`;

  return `(${bypassSetting} OR ${tenantColumn} = ${tenantSetting})`;
}

export function getTenantPolicyName(tableName: string): string {
  return `${tableName}_tenant_isolation`;
}

export function buildEnableTenantRlsStatements(tableName: string, tenantColumn = 'tenant_id'): string[] {
  const policyName = getTenantPolicyName(tableName);
  const predicate = buildTenantIsolationPredicate(tenantColumn);

  return [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${policyName} ON ${tableName}`,
    `CREATE POLICY ${policyName} ON ${tableName} FOR ALL USING (${predicate}) WITH CHECK (${predicate})`
  ];
}

export function buildDisableTenantRlsStatements(tableName: string): string[] {
  const policyName = getTenantPolicyName(tableName);

  return [`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`, `ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`];
}
