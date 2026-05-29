FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
ARG SERVICE_NAME=portal
ARG SERVICE_PORT=3001
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_PORT=${SERVICE_PORT}
RUN node -e "const fs=require('fs'); const service=process.env.SERVICE_NAME; const port=Number(process.env.SERVICE_PORT); fs.writeFileSync('package.json', JSON.stringify({name:'fastsaas-'+service+'-placeholder', private:true, type:'module'}, null, 2)+'\\n'); fs.writeFileSync('server.mjs', `import http from 'node:http';\nconst port = Number(process.env.PORT || ${port});\nconst service = process.env.APP_NAME || '${service}';\nconst healthPath = process.env.HEALTH_PATH || '/health';\nconst apiBaseUrl = process.env.API_BASE_URL || 'http://api:3000';\nconst html = '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" /><title>FastSaaS Portal Placeholder</title><style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:4rem auto;padding:0 1rem;color:#0f172a}code{background:#e2e8f0;padding:.2rem .4rem;border-radius:.25rem}</style></head><body><h1>FastSaaS portal placeholder</h1><p>The real portal will replace this container once the frontend branch merges.</p><p>Expected API base URL: <code>'+apiBaseUrl+'</code></p></body></html>';\nconst server = http.createServer((req, res) => {\n  if (req.url === healthPath) {\n    res.writeHead(200, {'content-type': 'application/json'});\n    res.end(JSON.stringify({status: 'ok', service, mode: 'placeholder'}));\n    return;\n  }\n  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});\n  res.end(html);\n});\nserver.listen(port, '0.0.0.0', () => {\n  console.log(service + ' placeholder listening on ' + port);\n});\n`);"

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV APP_NAME=portal
ENV HEALTH_PATH=/health
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.HEALTH_PATH || '/health')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
