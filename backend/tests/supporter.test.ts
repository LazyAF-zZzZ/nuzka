// Supporter keys (docs/PLAN.md §10): the check, what is kept on disk, and the API.
//
// Every key here is signed with a throwaway pair; the maker's real secret key never
// comes near the tests. Environment first, before anything loads config.

import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rov-supporter-'));
process.env.ROV_USER_DATA_DIR = path.join(TMP, 'data');
process.env.ROV_USER_MEDIA_DIR = path.join(TMP, 'media');
process.env.ROV_USER_SOUND_DIR = path.join(TMP, 'sounds');
process.env.CONTROL_TOKEN = '';

const domain = require('../server/domain/supporter') as typeof import('../server/domain/supporter');
const store = require('../server/store/supporter') as typeof import('../server/store/supporter');
const { createApp } = require('../server/index') as typeof import('../server/index');
const { closeDatabase } = require('../server/store/db') as typeof import('../server/store/db');

const pair = crypto.generateKeyPairSync('ed25519');
const stranger = crypto.generateKeyPairSync('ed25519');
domain.useVerifyKeyForTests(pair.publicKey);

const NOW = Date.parse('2026-10-01T12:00:00+07:00');

function claims(over: Partial<import('../server/domain/supporter').SupporterClaims> = {}) {
  return { id: 'abc123', name: 'Team X', plan: 'supporter', issued: '2026-10-01', expires: '2026-12-31', ...over };
}

const good = (over = {}) => domain.signKey(claims(over), pair.privateKey);

// --- the check ------------------------------------------------------------------

test('a key the maker signed is accepted, with its details', () => {
  const check = domain.checkKey(good(), NOW);
  assert.ok(check.ok);
  assert.deepStrictEqual(check.claims, claims());
});

test('line breaks and spaces from a chat app do not matter', () => {
  const key = good();
  const mangled = `  ${key.slice(0, 40)}\n${key.slice(40, 90)} \r\n${key.slice(90)}  `;
  assert.ok(domain.checkKey(mangled, NOW).ok);
});

test('a key signed by anyone else is refused', () => {
  const forged = domain.signKey(claims(), stranger.privateKey);
  const check = domain.checkKey(forged, NOW);
  assert.strictEqual(check.ok, false);
  assert.strictEqual(!check.ok && check.problem, 'signature');
});

test('changing a single detail breaks the signature', () => {
  const key = good();
  const [body, sig] = key.slice(domain.KEY_PREFIX.length).split('.') as [string, string];
  const wire = JSON.parse(Buffer.from(body, 'base64url').toString());
  wire.e = '2099-12-31';
  const tampered = `${domain.KEY_PREFIX}${Buffer.from(JSON.stringify(wire)).toString('base64url')}.${sig}`;
  const check = domain.checkKey(tampered, NOW);
  assert.strictEqual(!check.ok && check.problem, 'signature');
});

test('things that are not keys are refused as format, never thrown on', () => {
  for (const junk of [undefined, null, 42, '', 'hello', 'RVS1-', 'RVS1-abc', 'RVS1-a.b.c', 'RVS1-###.###',
    `RVS1-${Buffer.from('{}').toString('base64url')}.${Buffer.alloc(10).toString('base64url')}`]) {
    const check = domain.checkKey(junk, NOW);
    assert.strictEqual(check.ok, false, String(junk));
    assert.strictEqual(!check.ok && check.problem, 'format', String(junk));
  }
});

test('signed but malformed details are refused', () => {
  // Signed properly, so only the claims validation can catch it.
  const body = Buffer.from(JSON.stringify({ v: 1, id: 'x', n: '', p: 'supporter', i: '2026-10-01', e: '2026-12-31' })).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(domain.KEY_PREFIX + body), pair.privateKey).toString('base64url');
  const check = domain.checkKey(`${domain.KEY_PREFIX}${body}.${sig}`, NOW);
  assert.strictEqual(!check.ok && check.problem, 'format');

  assert.throws(() => good({ expires: '2026-02-30' }));
  assert.throws(() => good({ name: 'x'.repeat(61) }));
});

test('a key works to the end of its last day in Bangkok, and not a moment after', () => {
  const key = good({ expires: '2026-12-31' });
  assert.ok(domain.checkKey(key, Date.parse('2026-12-31T23:59:59+07:00')).ok);
  // 07:00 UTC on the 31st would be the cut-off if the date were read as UTC.
  assert.ok(domain.checkKey(key, Date.parse('2026-12-31T10:00:00Z')).ok);
  const after = domain.checkKey(key, Date.parse('2027-01-01T00:00:00+07:00'));
  assert.strictEqual(!after.ok && after.problem, 'expired');
  assert.strictEqual(!after.ok && after.claims?.name, 'Team X');
});

test('a revoked key is refused even before it runs out', () => {
  const check = domain.checkKey(good(), NOW, new Set(['abc123']));
  assert.strictEqual(!check.ok && check.problem, 'revoked');
});

// --- the store ------------------------------------------------------------------

test('no key means no supporter', () => {
  store.resetSupporterForTests();
  assert.deepStrictEqual(store.supporterStatus(NOW), { active: false, state: 'none' });
});

test('a saved key survives a restart, and removing it brings the watermark back', () => {
  store.resetSupporterForTests();
  const saved = store.saveSupporterKey(`\n${good()}\n`, NOW);
  assert.ok(saved.ok);
  assert.strictEqual(saved.ok && saved.status.daysLeft, 92);

  store.resetSupporterForTests();
  const again = store.supporterStatus(NOW);
  assert.strictEqual(again.active, true);
  assert.strictEqual(again.name, 'Team X');

  const removed = store.removeSupporterKey(NOW);
  assert.strictEqual(removed.active, false);
  store.resetSupporterForTests();
  assert.strictEqual(store.supporterStatus(NOW).state, 'none');
});

test('an expired or forged key is not saved over a good one', () => {
  store.resetSupporterForTests();
  assert.ok(store.saveSupporterKey(good(), NOW).ok);

  const expired = store.saveSupporterKey(good({ id: 'old1', expires: '2026-09-01' }), NOW);
  assert.strictEqual(!expired.ok && expired.problem, 'expired');
  const forged = store.saveSupporterKey(domain.signKey(claims({ id: 'fake1' }), stranger.privateKey), NOW);
  assert.strictEqual(!forged.ok && forged.problem, 'signature');

  assert.strictEqual(store.supporterStatus(NOW).active, true);
  store.removeSupporterKey(NOW);
});

test('a key that runs out while the app is open turns itself off', () => {
  store.resetSupporterForTests();
  assert.ok(store.saveSupporterKey(good(), NOW).ok);
  const later = store.supporterStatus(Date.parse('2027-01-02T09:00:00+07:00'));
  assert.strictEqual(later.active, false);
  assert.strictEqual(later.state, 'expired');
  assert.strictEqual(later.daysLeft, 0);
  store.removeSupporterKey(NOW);
});

test('the revoked list switches a saved key off, and a broken download cannot switch it back on', () => {
  store.resetSupporterForTests();
  assert.ok(store.saveSupporterKey(good(), NOW).ok);

  assert.strictEqual(store.setRevokedIds(['abc123'], NOW), true);
  assert.strictEqual(store.supporterStatus(NOW).state, 'revoked');

  // A captive-portal page or a half-written file is not a list.
  assert.strictEqual(store.setRevokedIds('<html>login</html>', NOW), false);
  assert.strictEqual(store.setRevokedIds({ ids: [] }, NOW), false);
  assert.strictEqual(store.supporterStatus(NOW).state, 'revoked');

  // And the list on disk holds offline, across a restart.
  store.resetSupporterForTests();
  assert.strictEqual(store.supporterStatus(NOW).state, 'revoked');

  store.setRevokedIds([], NOW);
  assert.strictEqual(store.supporterStatus(NOW).state, 'active');
  store.removeSupporterKey(NOW);
});

test('downloading the revoked list: offline or a bad reply leaves the old list alone', async () => {
  store.resetSupporterForTests();
  store.setRevokedIds(['keep1'], NOW);

  const offline = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assert.strictEqual(await store.refreshRevokedList(offline), false);
  const notFound = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
  assert.strictEqual(await store.refreshRevokedList(notFound), false);
  assert.ok(fs.readFileSync(path.join(TMP, 'data', 'revoked-keys.json'), 'utf8').includes('keep1'));

  const fresh = (async () => new Response('["new1"]', { status: 200 })) as unknown as typeof fetch;
  assert.strictEqual(await store.refreshRevokedList(fresh), true);
  const onDisk = fs.readFileSync(path.join(TMP, 'data', 'revoked-keys.json'), 'utf8');
  assert.ok(onDisk.includes('new1') && !onDisk.includes('keep1'));
  store.setRevokedIds([], NOW);
});

test('listeners hear about changes they can see, once each', () => {
  store.resetSupporterForTests();
  const heard: boolean[] = [];
  store.onSupporterChange((status) => heard.push(status.active));
  store.saveSupporterKey(good(), NOW);
  store.saveSupporterKey(good(), NOW); // same key again: nothing new to say
  store.removeSupporterKey(NOW);
  assert.deepStrictEqual(heard, [true, false]);
});

// --- the API --------------------------------------------------------------------

const app = createApp();
let server: http.Server;
let base = '';

function request(method: string, url: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(`${base}${url}`, {
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('API: paste a key, read it back without the key itself, remove it', async () => {
  store.resetSupporterForTests();
  // Far enough ahead that the real clock never catches up with it.
  const key = good({ expires: '2099-12-31' });

  assert.strictEqual((await request('GET', '/api/supporter')).body.state, 'none');

  const put = await request('PUT', '/api/supporter', { key });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.active, true);
  assert.strictEqual(put.body.name, 'Team X');

  const get = await request('GET', '/api/supporter');
  assert.strictEqual(get.body.active, true);
  assert.ok(!JSON.stringify(get.body).includes(key.slice(10, 40)), 'the key is never sent back');

  const del = await request('DELETE', '/api/supporter');
  assert.strictEqual(del.body.active, false);
});

test('API: a bad key gets a 400 with a reason a person can act on', async () => {
  const junk = await request('PUT', '/api/supporter', { key: 'hello' });
  assert.strictEqual(junk.status, 400);
  assert.strictEqual(junk.body.code, 'format');
  assert.match(junk.body.error, /RVS1-/);

  const old = await request('PUT', '/api/supporter', { key: good({ id: 'old2', expires: '2020-01-31' }) });
  assert.strictEqual(old.status, 400);
  assert.strictEqual(old.body.code, 'expired');
  assert.strictEqual(old.body.status.expires, '2020-01-31');

  const missing = await request('PUT', '/api/supporter', {});
  assert.strictEqual(missing.status, 400);
});

// --- the watermark (S2) ---------------------------------------------------------

test('every broadcast graphic carries the watermark script, after the script that opens its socket', () => {
  const { PAGES } = require('../server/http/pages') as typeof import('../server/http/pages');
  const publicDir = path.join(__dirname, '..', '..', 'public');
  // Derived from PAGES, like the theme test, so a new overlay cannot be left out.
  const broadcast = Object.entries(PAGES).filter(([route]) => route.startsWith('/overlay') || route === '/result');
  assert.ok(broadcast.length >= 10, 'all ten broadcast graphics are checked');

  for (const [route, file] of broadcast) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    const size = html.search(/src="\/?js\/overlay-size\.js"/);
    assert.ok(size > 0, `${route} loads overlay-size.js, where the watermark lives`);
    const scripts = [...html.matchAll(/src="(\/?js\/[^"]+\.js)"/g)].map((m) => m[1] as string);
    const own = scripts.filter((s) => !/overlay-size|overlay-sfx|\/lib\//.test(s));
    for (const s of own) assert.ok(html.indexOf(s) < size, `${route}: ${s} declares the socket before overlay-size.js reads it`);
  }
});

test('the watermark starts hidden and only the server can show it', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'overlay-size.js'), 'utf8');
  // Shown first and hidden later would flash it on a supporter's stream at every load.
  assert.match(js, /watermark\.hidden = true;/);
  assert.match(js, /socket\.on\('supporter'/);
  assert.ok(js.includes('Nuzka · by LazyAF'), 'the watermark text');
  // The shield is a child of the watermark, so hiding the one hides the other: no second
  // element for a key to forget.
  assert.match(js, /watermark\.append\(watermarkLogo, watermarkText\);/, 'the logo sits inside the watermark');
  assert.ok(!/watermarkLogo\.hidden/.test(js), 'the logo has no visibility of its own');
});

test('the draft overlays carry the watermark in their banner, and the logo it shows is shipped', () => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  for (const file of ['overlay.html', 'overlay-1440.html']) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert.match(html, /<div class="pick-section" data-watermark-slot>/, `${file} marks its banner`);
  }
  const png = fs.readFileSync(path.join(publicDir, 'images', 'watermark-logo.png'));
  assert.strictEqual(png.subarray(1, 4).toString(), 'PNG', 'the logo the watermark loads is shipped');
});

test('the real maker key in the code is a valid Ed25519 public key', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'domain', 'supporter.ts'), 'utf8');
  const pem = source.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/);
  assert.ok(pem, 'a public key is embedded');
  assert.strictEqual(crypto.createPublicKey(pem[0]).asymmetricKeyType, 'ed25519');
  assert.ok(!/PRIVATE KEY/.test(source), 'no secret key in the source');
});
