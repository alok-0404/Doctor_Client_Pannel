// Run after building frontend and backend:
// node Btbiz_backend/scripts/check-production-serving.cjs
// This test never connects to MongoDB or uses a patient/staff session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

process.env.NODE_ENV = 'production';

const resolver = require('../dist/tenant/tenantResolver');
let lookups = 0;
resolver.resolveTenantId = async () => {
  lookups += 1;
  throw new Error('Simulated database lookup failure');
};

const app = require('../dist/app').default;
const assetsDir = path.resolve(__dirname, '../../Btbiz_frontend/dist/assets');
const script = fs.readdirSync(assetsDir).find((name) => name.endsWith('.js'));
assert.ok(script, 'Build the frontend before running this check');

function request(server, url, accept = '*/*') {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: url,
      headers: { Host: 'doctor-client-pannel.replit.app', Accept: accept },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(3000, () => req.destroy(new Error(`Request timed out: ${url}`)));
    req.on('error', reject);
  });
}

const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const home = await request(server, '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.equal(home.headers['cache-control'], 'no-store');

    const health = await request(server, '/health');
    assert.equal(health.status, 200);

    const js = await request(server, `/assets/${script}`);
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
    assert.match(js.headers['cache-control'], /immutable/);

    const missing = await request(server, '/assets/old-build-missing.js');
    assert.equal(missing.status, 404);
    assert.doesNotMatch(missing.headers['content-type'], /text\/html/);

    const page = await request(server, '/book-appointment', 'text/html');
    assert.equal(page.status, 200);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal(lookups, 0, 'Public UI must not query the tenant database');

    // Tenant checks still apply to APIs, including failure handling.
    const api = await request(server, '/patients/search?mobile=test');
    assert.equal(api.status, 403);
    assert.equal(lookups, 1);
    console.log('PASS: public assets load during tenant lookup failure; API isolation is preserved.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
