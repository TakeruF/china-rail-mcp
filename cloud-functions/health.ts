export function onRequestGet(): Response {
  return Response.json(
    {
      status: 'ok',
      service: 'china-rail-mcp',
      transport: 'streamable-http',
      provider: '12306-official',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
