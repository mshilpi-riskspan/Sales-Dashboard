// Accepts POST { url: "https://xxx.salesforce.com" } from the app after SOAP login.
// Stores the SF instance URL in a cookie so sf-api requests can proxy correctly.
export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const instanceUrl = body?.url;
  if (!instanceUrl || !instanceUrl.startsWith('https://')) {
    return new Response(JSON.stringify({ error: 'invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `sf_instance=${encodeURIComponent(instanceUrl)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`,
    },
  });
}
