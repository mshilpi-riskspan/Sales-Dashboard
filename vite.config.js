import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import https from 'https';
import http from 'http';
import { snowflakeQuery } from './functions/_lib/snowflake.js';
import { fetchAccountUsage } from './functions/_lib/accountUsage.js';
import { fetchCurrentClientsSnowflakeData } from './functions/_lib/currentClients.js';

// Stores instance URL after SOAP login — set via POST /sf-instance-url from the app
let sfInstanceUrl = null;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sfDomain = env.VITE_SF_DOMAIN || 'login';

  return {
    plugins: [
      react(),
      {
        name: 'sf-dynamic-proxy',
        configureServer(server) {
          // Client POSTs the instance URL here after SOAP login
          server.middlewares.use('/sf-instance-url', (req, res) => {
            if (req.method !== 'POST') {
              res.writeHead(405);
              res.end();
              return;
            }
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
              try {
                sfInstanceUrl = JSON.parse(body).url;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
              } catch {
                res.writeHead(400);
                res.end('bad json');
              }
            });
          });

          // Dynamic reverse proxy to the org instance — target changes after login
          server.middlewares.use('/sf-api', (req, res) => {
            if (!sfInstanceUrl) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify([{ errorCode: 'NOT_AUTH', message: 'Salesforce instance URL not registered — auth may have failed' }]));
              return;
            }
            const restPath = req.url.replace(/^\/sf-api/, '') || '/';
            const target = new URL(restPath, sfInstanceUrl);
            const transport = target.protocol === 'https:' ? https : http;
            const options = {
              hostname: target.hostname,
              port: target.port || (target.protocol === 'https:' ? 443 : 80),
              path: target.pathname + target.search,
              method: req.method,
              headers: { ...req.headers, host: target.hostname },
            };
            const proxyReq = transport.request(options, (proxyRes) => {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              proxyRes.pipe(res);
            });
            proxyReq.on('error', (e) => {
              res.writeHead(502);
              res.end(e.message);
            });
            req.pipe(proxyReq);
          });

          // Local mirror of functions/api/snowflake/test.js — same shared
          // connector, so dev and prod behave identically.
          server.middlewares.use('/api/snowflake/test', async (req, res) => {
            try {
              const result = await snowflakeQuery(env, 'SELECT 1 AS OK');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Local mirror of functions/api/snowflake/clients.js
          server.middlewares.use('/api/snowflake/clients', async (req, res) => {
            try {
              const result = await snowflakeQuery(
                env,
                `SELECT CLIENT_ID, CLIENT_NAME, DISPLAY_NAME, SALESFORCE_ACCOUNT_ID,
                        SNOWFLAKE_CLIENT_IDENTIFIER, CONTRACT_TIER, IS_ACTIVE,
                        IMPLIED_IS_ACTIVE, INDUSTRY, SEGMENT, SALES_LEAD
                 FROM DIM_CLIENT
                 ORDER BY COALESCE(DISPLAY_NAME, CLIENT_NAME)`
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Local mirror of functions/api/snowflake/account-usage.js
          server.middlewares.use('/api/snowflake/account-usage', async (req, res) => {
            const { searchParams } = new URL(req.url, 'http://localhost');
            const clientId = searchParams.get('clientId') || undefined;
            const accountId = searchParams.get('accountId') || undefined;
            try {
              const result = await fetchAccountUsage(env, { clientId, accountId });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Local mirror of functions/api/snowflake/current-clients.js
          server.middlewares.use('/api/snowflake/current-clients', async (req, res) => {
            try {
              const result = await fetchCurrentClientsSnowflakeData(env);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
    ],
    server: {
      // Static proxy: auth only — REST goes through the dynamic middleware above
      proxy: {
        '/sf-auth': {
          target: `https://${sfDomain}.salesforce.com`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sf-auth/, ''),
          secure: true,
        },
      },
    },
  };
});
