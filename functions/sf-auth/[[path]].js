// Proxies /sf-auth/* → https://login.salesforce.com/*
// Handles the SOAP login request that needs to reach SF's auth endpoint.
export async function onRequest(context) {
  const { request, params, env } = context;
  const sfDomain = env.VITE_SF_DOMAIN || 'login';

  const originalUrl = new URL(request.url);
  const path = '/' + (params.path || []).join('/');
  const targetUrl = `https://${sfDomain}.salesforce.com${path}${originalUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set('host', `${sfDomain}.salesforce.com`);

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
