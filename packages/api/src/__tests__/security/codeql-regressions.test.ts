import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type RequestHandler } from 'express';
import { SquadPlacesClient } from '@fastsaas/shared';
import type { Logger } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../errors/app-error';
import { InMemoryPublisherPlanRepository } from '../../repositories/publisher-plan-repository';
import { InMemorySubscriptionRepository } from '../../repositories/subscription-repository';
import {
  PublisherService,
  type CreatePublisherPlanInput,
  type PublisherActorContext
} from '../../services/publisher-service';

const actor: PublisherActorContext = {
  tenantId: 'publisher-security-tests',
  userId: 'retro',
  requestId: 'req-security',
  correlationId: 'corr-security'
};

const rateLimitModulePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'middleware', 'rate-limit.ts');
const rateLimitImportSpecifier = '../../middleware/rate-limit';

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  } as unknown as Logger;
}

function createPublisherService(): PublisherService {
  return new PublisherService(
    new InMemorySubscriptionRepository(),
    new InMemoryPublisherPlanRepository(),
    createLogger()
  );
}

function createPlanInput(overrides: Partial<CreatePublisherPlanInput> = {}): CreatePublisherPlanInput {
  return {
    name: 'Security Regression Plan',
    description: 'Verifies CodeQL ReDoS hardening.',
    status: 'active',
    features: ['security'],
    ...overrides
  };
}

function readBaseUrl(client: SquadPlacesClient): string {
  return (client as unknown as { baseUrl: string }).baseUrl;
}

async function importRateLimitModule(
): Promise<{ authLimiter?: RequestHandler; apiLimiter?: RequestHandler }> {
  vi.resetModules();
  return (await import(rateLimitImportSpecifier)) as {
    authLimiter?: RequestHandler;
    apiLimiter?: RequestHandler;
  };
}

async function withEnvironment<T>(
  overrides: Record<string, string | undefined>,
  action: () => Promise<T>
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await action();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function measureAsync<T>(action: () => Promise<T>): Promise<{ durationMs: number; result?: T; error?: unknown }> {
  const startedAt = performance.now();

  try {
    const result = await action();
    return { durationMs: performance.now() - startedAt, result };
  } catch (error) {
    return { durationMs: performance.now() - startedAt, error };
  }
}

function measureSync<T>(action: () => T): { durationMs: number; result: T } {
  const startedAt = performance.now();
  const result = action();
  return { durationMs: performance.now() - startedAt, result };
}

describe('CodeQL security regressions', () => {
  describe('ReDoS protections', () => {
    it('rejects an all-dash slugify input without taking polynomial time', async () => {
      const service = createPublisherService();
      const { durationMs, error } = await measureAsync(() =>
        service.createPlan(actor, createPlanInput({ id: '-'.repeat(50000) }))
      );

      expect(durationMs).toBeLessThan(100);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Plan id could not be derived from the provided input'
      });
    });

    it('slugifies mixed special-character input quickly', async () => {
      const service = createPublisherService();
      const { durationMs, result, error } = await measureAsync(() =>
        service.createPlan(actor, createPlanInput({ id: `a${'-'.repeat(10000)}!` }))
      );

      expect(durationMs).toBeLessThan(100);
      expect(error).toBeUndefined();
      expect(result?.id).toBe('a');
    });

    it.each([
      { input: 'Hello World!', expected: 'hello-world' },
      { input: '  --foo--  ', expected: 'foo' }
    ])('preserves expected slugification for "$input"', async ({ input, expected }) => {
      const service = createPublisherService();
      const plan = await service.createPlan(actor, createPlanInput({ id: input }));

      expect(plan.id).toBe(expected);
    });

    it('constructs SquadPlacesClient quickly for URLs with many trailing slashes', () => {
      const { durationMs, result } = measureSync(
        () => new SquadPlacesClient({ baseUrl: `https://example.com${'/'.repeat(50000)}` })
      );

      expect(durationMs).toBeLessThan(100);
      expect(readBaseUrl(result)).toBe('https://example.com');
    });

    it('still trims normal SquadPlacesClient base URLs', () => {
      const client = new SquadPlacesClient({ baseUrl: 'https://example.com///' });

      expect(readBaseUrl(client)).toBe('https://example.com');
    });
  });

  describe('rate limiting middleware', () => {
    if (existsSync(rateLimitModulePath)) {
      it('exports authLimiter and apiLimiter middleware', async () => {
        const rateLimitModule = await importRateLimitModule();

        expect(typeof rateLimitModule.authLimiter).toBe('function');
        expect(typeof rateLimitModule.apiLimiter).toBe('function');
      });

      it('returns 429 after repeated requests exceed the configured auth limit', async () => {
        await withEnvironment({
          NODE_ENV: 'production',
          RATE_LIMIT_WINDOW_MS: '60000',
          RATE_LIMIT_AUTH_MAX_REQUESTS: '2'
        }, async () => {
          const rateLimitModule = await importRateLimitModule();
          const app = express();

          app.use((req, _res, next) => {
            (req as { id?: string }).id = 'req-rate-limit';
            next();
          });
          app.get('/auth/test', rateLimitModule.authLimiter!, (_req, res) => {
            res.status(200).json({ ok: true });
          });

          await request(app).get('/auth/test').expect(200);
          await request(app).get('/auth/test').expect(200);
          const limitedResponse = await request(app).get('/auth/test').expect(429);

          expect(limitedResponse.body.error.code).toBe('RATE_LIMITED');
          expect(limitedResponse.body.error.message).toBe('Too many requests, please try again later.');
        });
      });
    } else {
      it.todo('exports authLimiter and apiLimiter middleware once src/middleware/rate-limit.ts lands');
      it.todo('returns 429 after repeated requests exceed the configured limit once limiter wiring lands');
    }
  });
});
