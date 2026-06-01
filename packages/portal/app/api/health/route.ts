export function GET(): Response {
  return Response.json({
    status: 'ok',
    service: 'portal',
    timestamp: new Date().toISOString(),
  });
}
