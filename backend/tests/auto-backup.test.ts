// Automatic backups (services/auto-backup.ts).
//
// Written after 2026-09-28, when a user's tournament vanished with no copy anywhere. What
// matters most: a backup brings the data back after it is gone, and an empty state can
// never push the good backups out.
//
// Environment first, before anything loads config.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rov-auto-backup-'));
process.env.ROV_USER_DATA_DIR = path.join(TMP, 'data');
process.env.ROV_USER_MEDIA_DIR = path.join(TMP, 'media');
process.env.ROV_USER_SOUND_DIR = path.join(TMP, 'sounds');
process.env.CONTROL_TOKEN = '';

const auto = require('../server/services/auto-backup') as typeof import('../server/services/auto-backup');
const { getStores } = require('../server/store/index') as typeof import('../server/store/index');
const { closeDatabase } = require('../server/store/db') as typeof import('../server/store/db');
const { createApp } = require('../server/index') as typeof import('../server/index');
import { must } from './helpers';

const T0 = Date.parse('2026-09-28T12:00:00Z');
const at = (minutes: number) => T0 + minutes * 60 * 1000;

function wipe(): void {
  const s = getStores();
  for (const t of s.tournaments.list()) s.tournaments.remove(t.id);
  for (const t of s.teams.list()) s.teams.remove(t.id);
}

test.after(() => {
  closeDatabase();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('no database yet: nothing is written, and no database is created just for a backup', () => {
  const result = auto.takeBackup('start', at(0));
  assert.deepStrictEqual(result, { written: false, skipped: 'empty' });
  assert.ok(!fs.existsSync(path.join(TMP, 'data', 'tournament.db')));
});

test('an empty database is never backed up', () => {
  getStores(); // opens the database, with nothing in it
  assert.deepStrictEqual(auto.takeBackup('interval', at(1)), { written: false, skipped: 'empty' });
});

test('data is backed up once, and an unchanged state is not written again', () => {
  const s = getStores();
  const team = must(s.teams.create({ name: 'Apex Predators' }).team);
  must(s.tournaments.create({ name: 'ROV Champions Invitational 2026', format: 'single_elim', bestOf: 1 }).tournament);
  s.teams.create({ name: 'Zenith Gaming' });

  const first = auto.takeBackup('change', at(2));
  assert.ok(first.written);
  assert.strictEqual(first.written && first.entry.teams, 2);
  assert.strictEqual(first.written && first.entry.tournaments, 1);
  assert.match(first.written ? first.entry.name : '', /^auto-20260928-120200\.json$/);

  assert.deepStrictEqual(auto.takeBackup('interval', at(3)), { written: false, skipped: 'unchanged' });

  s.teams.update(team.id, { name: 'Apex Predators TH' });
  assert.ok(auto.takeBackup('change', at(4)).written, 'a real change is written');
  assert.strictEqual(auto.listBackups().length, 2);
});

test('after the data is gone, restoring the newest backup brings it back', () => {
  wipe();
  assert.strictEqual(getStores().teams.list().length, 0);
  // The loss itself must not produce a backup that could crowd the good ones out.
  assert.deepStrictEqual(auto.takeBackup('change', at(5)), { written: false, skipped: 'empty' });

  const newest = auto.listBackups()[0];
  const result = auto.restoreBackup(newest.name);
  assert.ok(!('error' in result), JSON.stringify(result));
  const names = getStores().teams.list().map((t) => t.name).sort();
  assert.deepStrictEqual(names, ['Apex Predators TH', 'Zenith Gaming']);
  assert.strictEqual(getStores().tournaments.list()[0].name, 'ROV Champions Invitational 2026');
});

test('restore only adds: what exists now is kept, and the state before it is backed up', () => {
  const s = getStores();
  s.teams.create({ name: 'Made after the backup' });
  const before = auto.listBackups().length;
  const oldest = auto.listBackups().at(-1)!;

  const result = auto.restoreBackup(oldest.name);
  assert.ok(!('error' in result));
  assert.ok(s.teams.list().some((t) => t.name === 'Made after the backup'), 'nothing current is deleted');
  const after = auto.listBackups();
  assert.strictEqual(after.length, before + 1, 'the state before the restore was backed up');
  assert.strictEqual(after[0].reason, 'before-restore');
});

test('only the newest 30 are kept, and empty moments never evict them', () => {
  const s = getStores();
  for (let i = 0; i < 35; i++) {
    s.teams.create({ name: `Team ${i}` });
    auto.takeBackup('change', at(100 + i));
  }
  const kept = auto.listBackups();
  assert.strictEqual(kept.length, auto.KEEP);
  assert.strictEqual(fs.readdirSync(auto.backupDir()).filter((f) => f.startsWith('auto-')).length, auto.KEEP);
  assert.ok(kept[0].at > kept[kept.length - 1].at, 'newest first');

  wipe();
  for (let i = 0; i < 10; i++) auto.takeBackup('interval', at(200 + i));
  assert.strictEqual(auto.listBackups()[0].at, kept[0].at, 'the good backups are all still there');
});

test('a missing index is rebuilt from the files themselves', () => {
  fs.rmSync(path.join(auto.backupDir(), 'index.json'), { force: true });
  const list = auto.listBackups();
  assert.strictEqual(list.length, auto.KEEP);
  assert.ok(list.every((e) => e.teams > 0));
});

test('restore refuses names that are not automatic backups', () => {
  for (const name of ['../tournament.db', 'index.json', 'auto-2026.json', 'C:\\Windows\\win.ini']) {
    const result = auto.restoreBackup(name);
    assert.ok('error' in result && result.status === 400, name);
  }
  const gone = auto.restoreBackup('auto-19990101-000000.json');
  assert.ok('error' in gone && gone.status === 404);
});

test('the main database file holds the data on its own after a backup', () => {
  const s = getStores();
  s.teams.create({ name: 'Checkpointed' });
  assert.ok(auto.takeBackup('change', at(300)).written);
  const wal = path.join(TMP, 'data', 'tournament.db-wal');
  assert.ok(!fs.existsSync(wal) || fs.statSync(wal).size === 0, 'the WAL was folded in and emptied');
});

test('API: list and restore', async () => {
  const app = createApp();
  const server: http.Server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const list = await (await fetch(`${base}/api/backup/auto`)).json() as { folder: string; backups: { name: string; teams: number; fingerprint?: string }[] };
    assert.strictEqual(list.backups.length, auto.KEEP);
    assert.ok(list.folder.endsWith('backups'));
    assert.strictEqual(list.backups[0].fingerprint, undefined, 'internals stay internal');

    wipe();
    const reply = await fetch(`${base}/api/backup/auto/${list.backups[0].name}/restore`, { method: 'POST' });
    assert.strictEqual(reply.status, 200);
    assert.ok(getStores().teams.list().length > 0);

    const bad = await fetch(`${base}/api/backup/auto/..%2Ftournament.db/restore`, { method: 'POST' });
    assert.strictEqual(bad.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
