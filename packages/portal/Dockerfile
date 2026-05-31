FROM node:22-alpine
WORKDIR /app

COPY packages/portal/placeholder/package.json ./package.json
COPY packages/portal/placeholder/server.mjs ./server.mjs

ENV NODE_ENV=production
ENV PORT=3001
ENV APP_NAME=portal
ENV HEALTH_PATH=/health

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.HEALTH_PATH || '/health')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
