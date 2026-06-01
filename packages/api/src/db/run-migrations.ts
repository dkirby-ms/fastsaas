import { createDatabase } from './database';
import { runMigrations } from './migrator';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const database = createDatabase(databaseUrl);

  try {
    await runMigrations(database);
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
