// Proxies /sf-api/* → https://{sf-instance}/*
// Reads the SF instance URL from the cookie set by /sf-instance-url.
export async function onRequest(context) {
  const { request, params } = context;

  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/sf_instance=([^;]+)/);

  if (!match) {
    return new Response(
      JSON.stringify([{ errorCode: 'NOT_AUTH', message: 'Salesforce instance URL not registered — please refresh the page to re-authenticate' }]),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const instanceUrl = decodeURIComponent(match[1]);
  const originalUrl = new URL(request.url);
  const path = '/' + (params.path || []).join('/');
  const targetUrl = `${instanceUrl}${path}${originalUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set('host', new URL(instanceUrl).hostname);
  headers.delete('cookie'); // Don't forward our internal cookie to Salesforce

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
