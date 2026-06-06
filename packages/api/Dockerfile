FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages

RUN npm ci
RUN npm run build --workspace @fastsaas/shared
RUN npm run build --workspace @fastsaas/api
RUN npm prune --omit=dev
RUN mkdir -p /app/release/packages/api /app/release/packages/shared \
    && cp package.json package-lock.json /app/release/ \
    && cp -R node_modules /app/release/node_modules \
    && cp packages/api/package.json /app/release/packages/api/package.json \
    && cp -R packages/api/dist /app/release/packages/api/dist \
    && cp packages/shared/package.json /app/release/packages/shared/package.json \
    && cp -R packages/shared/dist /app/release/packages/shared/dist

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    API_PORT=3000

COPY --from=build /app/release/ ./

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT || 3000)+'/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "packages/api/dist/server.js"]
