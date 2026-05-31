import type { Pool, PoolClient } from 'pg';

import type { PostgresUsageEventSqlClient } from '../metering/postgres-repository';

interface QueryRunner {
  query<T>(query: string, values: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

interface QueryableSqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

class PgQueryableSqlClient implements QueryableSqlClient {
  constructor(private readonly runner: QueryRunner) {}

  async $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    const result = await this.runner.query<T>(query, values);
    return result.rows as T;
  }

  async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
    const result = await this.runner.query(query, values);
    return result.rowCount ?? 0;
  }
}

export class PgPoolSqlClient extends PgQueryableSqlClient implements PostgresUsageEventSqlClient {
  constructor(private readonly pool: Pool) {
    super(pool);
  }

  async $transaction<T>(callback: (tx: QueryableSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const transactionClient = new PgTransactionSqlClient(client);
      const result = await callback(transactionClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

class PgTransactionSqlClient extends PgQueryableSqlClient {
  constructor(client: PoolClient) {
    super(client);
  }
}
