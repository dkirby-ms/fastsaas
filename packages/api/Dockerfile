FROM node:22-alpine AS base
WORKDIR /app

FROM base AS build
ARG SERVICE_NAME=api
ARG SERVICE_PORT=3000
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_PORT=${SERVICE_PORT}
RUN node -e "const fs=require('fs'); const service=process.env.SERVICE_NAME; const port=Number(process.env.SERVICE_PORT); fs.writeFileSync('package.json', JSON.stringify({name:'fastsaas-'+service+'-placeholder', private:true, type:'module'}, null, 2)+'\\n'); fs.writeFileSync('server.mjs', `import http from 'node:http';\nconst port = Number(process.env.PORT || ${port});\nconst service = process.env.APP_NAME || '${service}';\nconst healthPath = process.env.HEALTH_PATH || '/health';\nconst server = http.createServer((req, res) => {\n  if (req.url === healthPath) {\n    res.writeHead(200, {'content-type': 'application/json'});\n    res.end(JSON.stringify({status: 'ok', service, mode: 'placeholder'}));\n    return;\n  }\n  const body = {\n    status: 'placeholder',\n    service,\n    message: 'Application code will be mounted here once the service implementation lands.'\n  };\n  res.writeHead(200, {'content-type': 'application/json'});\n  res.end(JSON.stringify(body));\n});\nserver.listen(port, '0.0.0.0', () => {\n  console.log(service + ' placeholder listening on ' + port);\n});\n`);"

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_NAME=api
ENV HEALTH_PATH=/health
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+(process.env.HEALTH_PATH || '/health')).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
