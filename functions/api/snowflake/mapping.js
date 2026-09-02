import { fetchCompanyMap, updateCompanyMapField, ALLOWED_FIELDS, UUID_RE } from '../../_lib/companyMapping.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    try {
      const rows = await fetchCompanyMap(env);
      return new Response(JSON.stringify(rows), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (request.method === 'PATCH') {
    try {
      const { id, field, value } = await request.json();
      if (!UUID_RE.test(String(id))) {
        return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (!ALLOWED_FIELDS.has(field)) {
        return new Response(JSON.stringify({ error: `Field '${field}' is not editable` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      await updateCompanyMapField(env, id, field, value);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
