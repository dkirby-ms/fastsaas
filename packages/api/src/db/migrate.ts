import { createConfig } from '../config';
import { createDatabase } from './database';
import { runDatabaseMigrations } from './migrator';

async function main(): Promise<void> {
  const config = createConfig();

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to run database migrations');
  }

  const database = createDatabase(config.databaseUrl);

  try {
    const results = await runDatabaseMigrations(database);
    const executed = results.filter((result) => result.status === 'Success').map((result) => result.migrationName);

    if (executed.length > 0) {
      console.info(`Applied migrations: ${executed.join(', ')}`);
    } else {
      console.info('Database migrations are already up to date');
    }
  } finally {
    await database.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
