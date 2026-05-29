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
        description: 'Foundation API for authentication, tenant context, and core platform endpoints.'
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
      join(sourceRoot, 'routes', 'v1', 'metering.ts'),
      join(runtimeRoot, 'routes', 'health.js'),
      join(runtimeRoot, 'routes', 'v1', 'auth.js'),
      join(runtimeRoot, 'routes', 'v1', 'metering.js')
    ]
  };

  return swaggerJSDoc(options);
}
