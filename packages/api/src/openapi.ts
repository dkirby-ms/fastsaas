import { join, resolve } from 'node:path';

import swaggerJSDoc from 'swagger-jsdoc';

import type { ApiConfig } from './config';

export function buildOpenApiSpec(config: ApiConfig) {
  const sourceRoot = resolve(__dirname, '../src');
  const runtimeRoot = resolve(__dirname);

  const options = {
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'FastSaaS API',
        version: config.apiVersion,
        description: 'Backend API for authentication, tenant context, subscription lifecycle management, and marketplace webhooks.'
      },
      servers: [
        {
          url: '/'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    },
    apis: [
      join(sourceRoot, 'routes', 'health.ts'),
      join(sourceRoot, 'routes', 'v1', 'auth.ts'),
      join(sourceRoot, 'routes', 'v1', 'subscriptions.ts'),
      join(sourceRoot, 'routes', 'webhooks', 'marketplace.ts'),
      join(runtimeRoot, 'routes', 'health.js'),
      join(runtimeRoot, 'routes', 'v1', 'auth.js'),
      join(runtimeRoot, 'routes', 'v1', 'subscriptions.js'),
      join(runtimeRoot, 'routes', 'webhooks', 'marketplace.js')
    ]
  };

  return swaggerJSDoc(options);
}
