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
ARG NEXTAUTH_SECRET=build-only-secret
ARG AZURE_AD_TENANT_ID=build-tenant
ARG AZURE_AD_CLIENT_ID=build-client
ARG AZURE_AD_CLIENT_SECRET=build-secret
ARG AZURE_AD_API_CLIENT_ID=build-api-client

ENV API_BASE_URL=${API_BASE_URL}
ENV NEXT_PUBLIC_API_BASE_URL=${API_BASE_URL}
ENV APP_NAME=${APP_NAME}
ENV HEALTH_PATH=${HEALTH_PATH}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV AZURE_AD_TENANT_ID=${AZURE_AD_TENANT_ID}
ENV AZURE_AD_CLIENT_ID=${AZURE_AD_CLIENT_ID}
ENV AZURE_AD_CLIENT_SECRET=${AZURE_AD_CLIENT_SECRET}
ENV AZURE_AD_API_CLIENT_ID=${AZURE_AD_API_CLIENT_ID}

RUN npm run build --workspace=@fastsaas/portal

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
ENV API_BASE_URL=http://api:3000
ENV NEXT_PUBLIC_API_BASE_URL=http://api:3000
ENV APP_NAME=portal
ENV HEALTH_PATH=/health

COPY --from=builder /app/packages/portal/.next/standalone ./
COPY --from=builder /app/packages/portal/.next/static ./packages/portal/.next/static

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.HEALTH_PATH || '/health')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "packages/portal/server.js"]
