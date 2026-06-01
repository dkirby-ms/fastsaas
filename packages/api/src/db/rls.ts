function tenantPolicyName(tableName: string): string {
  return `${tableName}_tenant_isolation`;
}

function bypassExpression(): string {
  return "coalesce(current_setting('fastsaas.rls_bypass', true), 'off') = 'on'";
}

function tenantExpression(columnName: string): string {
  return `${columnName} = current_setting('fastsaas.tenant_id', true)`;
}

export function buildEnableTenantRlsStatements(tableName: string, tenantColumn: string): string[] {
  return [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${tenantPolicyName(tableName)} ON ${tableName}`,
    `CREATE POLICY ${tenantPolicyName(tableName)} ON ${tableName} USING (${bypassExpression()} OR ${tenantExpression(tenantColumn)}) WITH CHECK (${bypassExpression()} OR ${tenantExpression(tenantColumn)})`
  ];
}

export function buildDisableTenantRlsStatements(tableName: string): string[] {
  return [
    `DROP POLICY IF EXISTS ${tenantPolicyName(tableName)} ON ${tableName}`,
    `ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY`,
    `ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`
  ];
}
