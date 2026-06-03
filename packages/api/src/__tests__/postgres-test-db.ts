import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Client } from 'pg';
import type { Kysely } from 'kysely';

import { sql } from 'kysely';

import { createDatabase, type Database } from '../db/database';
import { migrateToLatest } from '../db/migrator';

const execFileAsync = promisify(execFile);
const POSTGRES_IMAGE = 'postgres:16-alpine';
const DOCKER_RUN_MAX_ATTEMPTS = 3;
const DOCKER_RETRY_DELAY_MS = 1_500;

async function runDockerCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { timeout: 120_000 });
  return stdout.trim();
}

function getDockerErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '';
  }

  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
  return `${error.message}\n${stderr}`;
}

function isAddressInUseError(error: unknown): boolean {
  return getDockerErrorMessage(error).includes('address already in use');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startPostgresContainer(): Promise<string> {
  for (let attempt = 1; attempt <= DOCKER_RUN_MAX_ATTEMPTS; attempt += 1) {
    const containerName = `fastsaas-audit-${randomUUID()}`;

    try {
      await runDockerCommand([
        'run',
        '--rm',
        '--detach',
        '--name',
        containerName,
        '--env',
        'POSTGRES_DB=fastsaas',
        '--env',
        'POSTGRES_USER=postgres',
        '--env',
        'POSTGRES_PASSWORD=postgres',
        '--publish-all',
        POSTGRES_IMAGE
      ]);

      return containerName;
    } catch (error) {
      await runDockerCommand(['rm', '--force', containerName]).catch(() => undefined);

      if (!isAddressInUseError(error) || attempt === DOCKER_RUN_MAX_ATTEMPTS) {
        throw error;
      }

      console.warn(
        `Docker assigned a conflicting host port while starting ${containerName}; retrying (${attempt}/${DOCKER_RUN_MAX_ATTEMPTS})...`
      );
      await sleep(DOCKER_RETRY_DELAY_MS);
    }
  }

  throw new Error('PostgreSQL test container could not be started');
}

async function waitForDatabase(connectionString: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new Client({ connectionString });

    try {
      await client.connect();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw new Error('PostgreSQL test container did not become ready in time');
}

export class PostgresTestDatabase {
  constructor(
    readonly containerName: string,
    readonly adminConnectionString: string,
    readonly connectionString: string,
    readonly adminDb: Kysely<Database>,
    readonly db: Kysely<Database>
  ) {}

  static async start(): Promise<PostgresTestDatabase> {
    const containerName = await startPostgresContainer();
    let adminDb: Kysely<Database> | undefined;
    let db: Kysely<Database> | undefined;

    try {
      const port = await runDockerCommand([
        'inspect',
        '--format',
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
        containerName
      ]);
      const adminConnectionString = `postgres://postgres:postgres@127.0.0.1:${port}/fastsaas`;
      await waitForDatabase(adminConnectionString);

      adminDb = createDatabase(adminConnectionString);
      await migrateToLatest(adminDb);
      await sql.raw(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fastsaas_app') THEN
            CREATE ROLE fastsaas_app LOGIN PASSWORD 'fastsaas';
          END IF;
        END
        $$;
      `).execute(adminDb);
      await sql.raw('GRANT CONNECT ON DATABASE fastsaas TO fastsaas_app').execute(adminDb);
      await sql.raw('GRANT USAGE ON SCHEMA public TO fastsaas_app').execute(adminDb);
      await sql.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE audit_logs TO fastsaas_app').execute(adminDb);

      const connectionString = `postgres://fastsaas_app:fastsaas@127.0.0.1:${port}/fastsaas`;
      db = createDatabase(connectionString);

      return new PostgresTestDatabase(containerName, adminConnectionString, connectionString, adminDb, db);
    } catch (error) {
      await Promise.allSettled([adminDb?.destroy(), db?.destroy()]);
      await runDockerCommand(['rm', '--force', containerName]).catch(() => undefined);
      throw error;
    }
  }

  async resetAuditLogs(): Promise<void> {
    await sql`truncate table audit_logs`.execute(this.adminDb);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
    await this.adminDb.destroy();
    await runDockerCommand(['rm', '--force', this.containerName]).catch(() => undefined);
  }
}
