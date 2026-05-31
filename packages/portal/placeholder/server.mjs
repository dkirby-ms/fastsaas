import http from 'node:http';

const port = Number(process.env.PORT || 3001);
const service = process.env.APP_NAME || 'portal';
const healthPath = process.env.HEALTH_PATH || '/health';
const apiBaseUrl = process.env.API_BASE_URL || 'http://api:3000';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FastSaaS Portal Placeholder</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 48rem;
        margin: 4rem auto;
        padding: 0 1rem;
        color: #0f172a;
      }
      code {
        background: #e2e8f0;
        padding: 0.2rem 0.4rem;
        border-radius: 0.25rem;
      }
    </style>
  </head>
  <body>
    <h1>FastSaaS portal placeholder</h1>
    <p>The real portal will replace this container once the frontend branch merges.</p>
    <p>Expected API base URL: <code>${escapeHtml(apiBaseUrl)}</code></p>
  </body>
</html>`;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  if (requestUrl.pathname === healthPath) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service, mode: 'placeholder' }));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(renderHtml());
});

server.listen(port, '0.0.0.0', () => {
  console.log(`${service} placeholder listening on ${port}`);
});
