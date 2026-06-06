FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/portal/package.json packages/portal/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/shared ./packages/shared
COPY packages/portal ./packages/portal

ARG API_BASE_URL=http://api:3000
ARG APP_NAME=portal
ARG HEALTH_PATH=/health

ENV API_BASE_URL=${API_BASE_URL} \
    APP_NAME=${APP_NAME} \
    HEALTH_PATH=${HEALTH_PATH}

RUN npm run build --workspace=@fastsaas/shared
RUN NEXTAUTH_SECRET=build-only-secret \
    ENTRA_TENANT_ID=build-tenant \
    ENTRA_CLIENT_ID=build-client \
    ENTRA_CLIENT_SECRET=build-secret \
    ENTRA_API_CLIENT_ID=build-api-client \
    npm run build --workspace=@fastsaas/portal
RUN mkdir -p /app/release/packages/portal/.next \
    && cp -R /app/packages/portal/.next/standalone/. /app/release/ \
    && cp -R /app/packages/portal/.next/static /app/release/packages/portal/.next/static

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3001 \
    API_BASE_URL=http://api:3000 \
    APP_NAME=portal \
    HEALTH_PATH=/health

COPY --from=builder /app/release/ ./

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.HEALTH_PATH || '/health')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "packages/portal/server.js"]
