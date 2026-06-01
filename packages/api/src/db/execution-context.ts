import { AsyncLocalStorage } from 'node:async_hooks';

import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './database';

export const APP_CURRENT_TENANT_SETTING = 'app.current_tenant';
export const APP_BYPASS_RLS_SETTING = 'app.bypass_rls';

export interface DatabaseExecutionContext {
  tenantId?: string;
  bypassRls: boolean;
  scope: 'anonymous' | 'tenant' | 'system';
  requestId?: string;
}

export interface SessionConfigSqlClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

const DEFAULT_CONTEXT: DatabaseExecutionContext = {
  bypassRls: false,
  scope: 'anonymous'
};

const executionContextStorage = new AsyncLocalStorage<DatabaseExecutionContext>();

export function getDatabaseExecutionContext(): DatabaseExecutionContext {
  return executionContextStorage.getStore() ?? DEFAULT_CONTEXT;
}

export function resolveDatabaseExecutionContext(
  overrides: Partial<DatabaseExecutionContext> = {}
): DatabaseExecutionContext {
  const current = getDatabaseExecutionContext();
  const nextScope = overrides.scope ?? current.scope;

  return {
    bypassRls: overrides.bypassRls ?? current.bypassRls,
    scope: nextScope,
    tenantId: overrides.tenantId ?? current.tenantId,
    requestId: overrides.requestId ?? current.requestId
  };
}

export function runWithDatabaseExecutionContext<T>(context: DatabaseExecutionContext, callback: () => T): T {
  return executionContextStorage.run(context, callback);
}

export function runWithTenantExecutionContext<T>(tenantId: string, requestId: string | undefined, callback: () => T): T {
  return runWithDatabaseExecutionContext(
    {
      tenantId,
      requestId,
      bypassRls: false,
      scope: 'tenant'
    },
    callback
  );
}

export function runWithSystemExecutionContext<T>(callback: () => T): T {
  return runWithDatabaseExecutionContext(
    {
      bypassRls: true,
      scope: 'system'
    },
    callback
  );
}

export async function applyDatabaseExecutionContext(
  executor: Kysely<Database> | Transaction<Database>,
  context = getDatabaseExecutionContext()
): Promise<void> {
  await sql`select set_config(${APP_CURRENT_TENANT_SETTING}, ${context.tenantId ?? ''}, true)`.execute(executor);
  await sql`select set_config(${APP_BYPASS_RLS_SETTING}, ${context.bypassRls ? 'true' : 'false'}, true)`.execute(executor);
}

export async function applySqlExecutionContext(
  executor: SessionConfigSqlClient,
  context = getDatabaseExecutionContext()
): Promise<void> {
  await executor.$executeRawUnsafe(`SELECT set_config('${APP_CURRENT_TENANT_SETTING}', $1, true)`, context.tenantId ?? '');
  await executor.$executeRawUnsafe(`SELECT set_config('${APP_BYPASS_RLS_SETTING}', $1, true)`, context.bypassRls ? 'true' : 'false');
}

export async function withDatabaseRlsContext<T>(
  db: Kysely<Database>,
  callback: (trx: Transaction<Database>, context: DatabaseExecutionContext) => Promise<T>,
  overrides: Partial<DatabaseExecutionContext> = {}
): Promise<T> {
  const context = resolveDatabaseExecutionContext(overrides);

  if (!context.bypassRls && !context.tenantId) {
    throw new Error('A tenant-scoped database operation requires a tenant id');
  }

  return executionContextStorage.run(context, () =>
    db.transaction().execute(async (trx) => {
      await applyDatabaseExecutionContext(trx, context);
      return callback(trx, context);
    })
  );
}
