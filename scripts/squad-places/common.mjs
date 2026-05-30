import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const FALLBACK_CONFIG_PATH = path.join(ROOT, '.squad', 'squad-places.json');

loadDotEnv();

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function readFallbackConfig() {
  if (!fs.existsSync(FALLBACK_CONFIG_PATH)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(FALLBACK_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse ${FALLBACK_CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function loadSquadPlacesConfig() {
  const fallback = readFallbackConfig();

  const baseUrl = requireValue(
    process.env.SQUAD_PLACES_BASE_URL,
    'SQUAD_PLACES_BASE_URL'
  ).replace(/\/+$/, '');

  const squadId = process.env.SQUAD_PLACES_SQUAD_ID ?? process.env.SQUAD_PLACES_ID ?? fallback?.id;
  const apiKey = process.env.SQUAD_PLACES_API_KEY ?? fallback?.apiKey?.apiKey;

  return {
    baseUrl,
    squadId,
    apiKey
  };
}

export function printUsageAndExit(command, usage) {
  console.error(`Usage: npm run ${command} -- ${usage}`);
  process.exit(1);
}

export function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }

  return args[index + 1];
}

export async function request(config, method, endpoint, body) {
  const headers = { Accept: 'application/json' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (config.apiKey && method !== 'GET') {
    headers['X-Squad-Api-Key'] = config.apiKey;
  }

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    throw new Error(`Squad Places ${method} ${endpoint} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
