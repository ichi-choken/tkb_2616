import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localAppServer } from '../scripts/serve-local.mjs';

test('integrated server serves the main build and callbacks, never source files or foreign origins', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shumitomo-server-'));
  await writeFile(join(directory, 'index.html'), '<html>Main app</html>');
  await writeFile(join(directory, '.env'), 'server-only-secret');
  const server = localAppServer({ directory, steam: async (req, res, url) => { if (url.pathname !== '/__steam/status.json') return false; res.writeHead(200).end('{}'); return true; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/auth/callback', '/auth/link-callback']) assert.match(await (await fetch(base + path)).text(), /Main app/);
    assert.deepEqual(await (await fetch(base + '/__local/status.json')).json(), { mode: 'local-integrations' });
    assert.equal((await fetch(base + '/__steam/status.json', { headers: { Origin: 'https://foreign.example' } })).status, 403);
    assert.equal((await fetch(base + '/__steam/status.json')).status, 200);
    for (const path of ['/.env', '/packages/integrations/.env', '/assets/%2e%2e/.env']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
