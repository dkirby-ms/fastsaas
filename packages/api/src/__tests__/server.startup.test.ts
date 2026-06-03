import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverEntryPath = path.join(packageRoot, 'src', 'server.ts');

describe('API startup validation', () => {
  it('fails closed when marketplace secrets are missing in production', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', serverEntryPath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        API_PORT: '0',
        AUTH_BYPASS_ENABLED: 'false',
        ENTRA_CLIENT_ID: 'fastsaas-api-client',
        MARKETPLACE_CLIENT_SECRET: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });

    expect(exitCode).toBe(1);
    expect(output).toContain('Failed to start API server');
    expect(output).toContain('Missing required marketplace secrets for NODE_ENV=production: MARKETPLACE_CLIENT_SECRET');
  });
});
