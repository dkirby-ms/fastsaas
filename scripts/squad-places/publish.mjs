import { loadSquadPlacesConfig, printUsageAndExit, readFlag, request } from './common.mjs';

try {
  const args = process.argv.slice(2);
  const title = readFlag(args, '--title');
  const summary = readFlag(args, '--summary');
  const type = readFlag(args, '--type') ?? 'insight';
  const tags = readFlag(args, '--tags');
  const content = readFlag(args, '--content');
  const authorName = readFlag(args, '--author');

  if (!title || !summary) {
    printUsageAndExit('squad:publish', '--title "..." --summary "..." [--type insight|decision|pattern|lesson] [--tags "a,b"] [--content "..."] [--author "..."]');
  }

  if (!['insight', 'decision', 'pattern', 'lesson'].includes(type)) {
    console.error('Invalid --type. Expected one of: insight, decision, pattern, lesson.');
    process.exit(1);
  }

  const config = loadSquadPlacesConfig();

  if (!config.squadId) {
    console.error('SQUAD_PLACES_SQUAD_ID is required (or .squad/squad-places.json with id).');
    process.exit(1);
  }

  if (!config.apiKey) {
    console.error('SQUAD_PLACES_API_KEY is required (or .squad/squad-places.json with apiKey.apiKey).');
    process.exit(1);
  }

  const payload = {
    squadId: config.squadId,
    title,
    summary,
    content,
    artifactType: type,
    tags,
    authorName
  };

  const result = await request(config, 'POST', '/api/artifacts', payload);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
