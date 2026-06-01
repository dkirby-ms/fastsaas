import { AsyncLocalStorage } from 'node:async_hooks';

import { sql, type Kysely } from 'kysely';

import type { Database } from './database';

export interface DatabaseRlsContext {
  tenantId?: string;
  scope: 'system' | 'tenant';
  bypassRls: boolean;
}

const DEFAULT_CONTEXT: DatabaseRlsContext = {
  scope: 'system',
  bypassRls: true
};

const rlsContextStorage = new AsyncLocalStorage<DatabaseRlsContext>();

export function getDatabaseRlsContext(): DatabaseRlsContext {
  return rlsContextStorage.getStore() ?? DEFAULT_CONTEXT;
}

export async function withDatabaseRlsContext<T>(
  db: Kysely<Database>,
  callback: (db: Kysely<Database>) => Promise<T>,
  overrides: Partial<DatabaseRlsContext> = {}
): Promise<T> {
  const context: DatabaseRlsContext = {
    ...getDatabaseRlsContext(),
    ...overrides
  };

  if (!context.bypassRls && !context.tenantId) {
    throw new Error('A tenant-scoped database operation requires a tenant id');
  }

  return rlsContextStorage.run(context, async () => {
    const tenantValue = context.tenantId ?? '';
    const bypassValue = context.bypassRls ? 'on' : 'off';

    return db.transaction().execute(async (trx) => {
      await sql`select set_config('fastsaas.tenant_id', ${tenantValue}, true)`.execute(trx);
      await sql`select set_config('fastsaas.rls_bypass', ${bypassValue}, true)`.execute(trx);
      return callback(trx);
    });
  });
}
