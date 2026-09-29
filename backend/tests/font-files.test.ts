import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rov-font-files-'));
process.env.ROV_USER_DATA_DIR = path.join(TMP, 'data');
process.env.ROV_USER_MEDIA_DIR = path.join(TMP, 'media');
process.env.ROV_USER_SOUND_DIR = path.join(TMP, 'sounds');
process.env.CONTROL_TOKEN = '';

const files = require('../server/domain/font-files') as typeof import('../server/domain/font-files');
const settings = require('../server/domain/settings') as typeof import('../server/domain/settings');
const { getState } = require('../server/store/live-state') as typeof import('../server/store/live-state');
const { createApp } = require('../server/index') as typeof import('../server/index');
const { closeDatabase } = require('../server/store/db') as typeof import('../server/store/db');

// Only the first bytes are ever inspected, so a header plus padding is a "font" here.
const fake = (head: number[] | string) =>
  Buffer.concat([typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head), Buffer.alloc(60, 7)]);

test('the file type comes from the first bytes, not the name', () => {
  assert.strictEqual(files.fontExtOf(fake([0, 1, 0, 0])), 'ttf');
  assert.strictEqual(files.fontExtOf(fake('true')), 'ttf');
  assert.strictEqual(files.fontExtOf(fake('OTTO')), 'otf');
  assert.strictEqual(files.fontExtOf(fake('wOFF')), 'woff');
  assert.strictEqual(files.fontExtOf(fake('wOF2')), 'woff2');
  assert.strictEqual(files.fontExtOf(fake('ttcf')), null, 'a collection cannot be used in @font-face');
  assert.strictEqual(files.fontExtOf(fake('\x89PNG')), null);
  assert.strictEqual(files.fontExtOf(Buffer.from('OTTO')), null, 'too short');
});

test('an imported font\'s family survives the family sanitiser unchanged', () => {
  const family = files.importedFamily('fabc123def4');
  assert.strictEqual(family, 'nzf-fabc123def4');
  assert.strictEqual(settings.sanitizeFontFamily(family), family);
  assert.strictEqual(files.importedIdOf(family), 'fabc123def4');
  assert.strictEqual(files.importedIdOf('Arial'), null);
  assert.strictEqual(files.importedIdOf('nzf-../../x'), null);
});

test('display names lose control characters and are kept short', () => {
  assert.strictEqual(files.sanitizeFontName('My\u0000Font\n Bold'), 'My Font Bold');
  assert.strictEqual(files.sanitizeFontName(''), 'Font');
  assert.strictEqual(files.sanitizeFontName('x'.repeat(200)).length, 60);
});

test('dropping a family clears it from all pages and every page override', () => {
  const fonts = settings.emptyFonts();
  fonts.all.heading = 'nzf-fabc123def4';
  fonts.all.body = 'Arial';
  fonts.pages.draft = { name: 'nzf-fabc123def4' };
  fonts.pages.teams = { name: 'nzf-fabc123def4', number: 'Arial' };
  assert.strictEqual(settings.dropFontFamily(fonts, 'nzf-fabc123def4'), true);
  assert.strictEqual(fonts.all.heading, '');
  assert.strictEqual(fonts.all.body, 'Arial');
  assert.deepStrictEqual(fonts.pages, { teams: { number: 'Arial' } });
  assert.strictEqual(settings.dropFontFamily(fonts, 'nzf-fabc123def4'), false, 'nothing left to change');
});

let server: Server;
let base = '';

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, '127.0.0.1', () => {
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

test('API: import, list, serve by id, and delete, which also clears roles using it', async () => {
  const bad = await fetch(`${base}/api/fonts?name=Photo`, { method: 'POST', body: fake('\x89PNG') });
  assert.strictEqual(bad.status, 415);

  const put = await fetch(`${base}/api/fonts?name=${encodeURIComponent('Sukhumvit Set')}&thai=1`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: fake('OTTO')
  });
  assert.strictEqual(put.status, 200);
  const { font } = await put.json() as { font: { id: string; family: string; name: string; thai: boolean } };
  assert.match(font.id, /^f[a-z0-9]{10}$/);
  assert.strictEqual(font.family, 'nzf-' + font.id);
  assert.strictEqual(font.name, 'Sukhumvit Set');
  assert.strictEqual(font.thai, true);

  const list = await (await fetch(`${base}/api/fonts`)).json() as { fonts: { id: string }[] };
  assert.deepStrictEqual(list.fonts.map((f) => f.id), [font.id]);

  const file = await fetch(`${base}/user-fonts/${font.id}`);
  assert.strictEqual(file.status, 200);
  assert.strictEqual(file.headers.get('content-type'), 'font/otf');
  assert.strictEqual(file.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString('latin1'), 'OTTO');
  assert.strictEqual((await fetch(`${base}/user-fonts/..%2F..%2Fdata`)).status, 404);
  assert.strictEqual((await fetch(`${base}/user-fonts/fzzzzzzzzzz`)).status, 404);

  const state = getState();
  state.fonts.all.heading = font.family;
  state.fonts.pages.draft = { name: font.family };

  const del = await fetch(`${base}/api/fonts/${font.id}`, { method: 'DELETE' });
  assert.strictEqual(del.status, 200);
  assert.strictEqual(getState().fonts.all.heading, '');
  assert.strictEqual(getState().fonts.pages.draft, undefined);
  assert.strictEqual((await fetch(`${base}/user-fonts/${font.id}`)).status, 404);
  assert.strictEqual((await fetch(`${base}/api/fonts/${font.id}`, { method: 'DELETE' })).status, 404);
});

test('the overlay font script declares imported fonts from the same id pattern the server uses', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'overlay-fonts.js'), 'utf8');
  assert.ok(js.includes('/^nzf-(f[a-z0-9]{10})$/'), 'same pattern as domain/font-files.ts');
  assert.ok(js.includes('/user-fonts/'), 'loads the file from the route that serves it');
});
