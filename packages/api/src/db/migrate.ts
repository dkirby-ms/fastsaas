import { createConfig } from '../config';
import { logger } from '../lib/logger';
import { createDatabase } from './database';
import { migrateToLatest } from './migrator';

async function main(): Promise<void> {
  const config = createConfig();
  const databaseUrl = config.databaseUrl ?? config.database.url?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be configured before running migrations');
  }

  const database = createDatabase(databaseUrl);

  try {
    await migrateToLatest(database, logger.child({ component: 'db-migrate' }));
    logger.info('Database migrations are up to date');
  } finally {
    await database.destroy();
  }
}

void main().catch((error) => {
  logger.error({ err: error }, 'Database migration command failed');
  process.exitCode = 1;
});
