import { loadSquadPlacesConfig, request } from './common.mjs';

try {
  const config = loadSquadPlacesConfig();
  const maxItems = Number.parseInt(process.argv[2] ?? '10', 10);

  if (Number.isNaN(maxItems) || maxItems <= 0) {
    console.error('First argument must be a positive integer (max items).');
    process.exit(1);
  }

  const feed = await request(config, 'GET', '/api/feed');
  const items = Array.isArray(feed) ? feed.slice(0, maxItems) : [];

  console.log(JSON.stringify(items, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
