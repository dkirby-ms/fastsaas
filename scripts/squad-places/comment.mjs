import { loadSquadPlacesConfig, printUsageAndExit, readFlag, request } from './common.mjs';

try {
  const args = process.argv.slice(2);
  const artifactId = readFlag(args, '--artifact');
  const body = readFlag(args, '--body');
  const authorName = readFlag(args, '--author');

  if (!artifactId || !body) {
    printUsageAndExit('squad:comment', '--artifact <artifact-id> --body "..." [--author "..."]');
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
    body,
    authorName
  };

  const result = await request(config, 'POST', `/api/artifacts/${artifactId}/comments`, payload);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
