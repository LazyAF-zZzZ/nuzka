// Automatic backups.
//
// Written after 2026-09-28, when a user's whole tournament (32 teams, a finished bracket)
// vanished and nothing on the PC held a copy: the database had not been checkpointed since
// the morning, so everything lived in the WAL, and the WAL was lost. Two defences:
//
//  1. A backup file, in the same format as Settings → Save a backup (logos included), in
//     <data>/backups/, a minute after any change to teams or tournaments, every 15 minutes
//     as a safety net, on a clean shutdown, and before any restore.
//  2. After each backup, a WAL checkpoint, so the main database file stops lagging hours
//     behind what the operator sees.
//
// Two rules keep the backups worth having:
//  - A backup identical to the newest one is not written (the index keeps a fingerprint).
//  - An EMPTY state (no teams, no tournaments) is never written. If data disappears again,
//    empty backups must not push the good ones out of the rotation.
// The newest 30 are kept.
//
// Timers start in start() only, never in createApp(), so tests never write backups on
// their own.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ROOT_DIR, TOURNAMENT_DB_PATH } from '../config';
import { getStores } from '../store/index';
import { getDatabase, isDatabaseOpen } from '../store/db';
import { readBackup, summarise } from '../domain/backup';
import type { RestoreReport } from '../store/backup';
import { onDataChange, notifyData } from './sync';
import { loadJson, writeJson } from '../lib/json';

export const KEEP = 30;
const AFTER_CHANGE_MS = 60 * 1000;
const EVERY_MS = 15 * 60 * 1000;
const NAME = /^auto-\d{8}-\d{6}(-\d+)?\.json$/;

export type BackupReason = 'change' | 'interval' | 'start' | 'shutdown' | 'before-restore' | 'manual';

export interface AutoBackupEntry {
  name: string;
  at: number;          // ms since 1970
  reason: BackupReason;
  fingerprint: string; // sha256 of the data, not of the timestamps
  bytes: number;
  teams: number;
  tournaments: number;
  matches: number;
  drafts: number;
}

export type TakeResult =
  | { written: true; entry: AutoBackupEntry }
  | { written: false; skipped: 'empty' | 'unchanged' | 'failed'; error?: string };

// Worked out on use, not on import: tests point DATA_DIR at a temp folder first.
export const backupDir = (): string => path.join(DATA_DIR, 'backups');
const indexPath = (): string => path.join(backupDir(), 'index.json');

function appVersion(): string {
  try {
    return String((JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as { version?: string }).version || 'unknown');
  } catch {
    return 'unknown';
  }
}

function isEntry(value: unknown): value is AutoBackupEntry {
  const e = value as AutoBackupEntry;
  return !!e && typeof e.name === 'string' && NAME.test(e.name) && typeof e.at === 'number' && typeof e.fingerprint === 'string';
}

// The index is a convenience; the files are the truth. Entries whose file is gone are
// dropped, and files the index does not know are read back in.
export function listBackups(): AutoBackupEntry[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  const raw = loadJson(indexPath(), [], { quiet: true });
  const known = (Array.isArray(raw) ? raw : []).filter(isEntry).filter((e) => fs.existsSync(path.join(dir, e.name)));
  const names = new Set(known.map((e) => e.name));
  for (const name of fs.readdirSync(dir)) {
    if (!NAME.test(name) || names.has(name)) continue;
    const entry = describeFile(name);
    if (entry) known.push(entry);
  }
  return known.sort((a, b) => b.at - a.at);
}

function describeFile(name: string): AutoBackupEntry | null {
  try {
    const full = path.join(backupDir(), name);
    const text = fs.readFileSync(full, 'utf8');
    const read = readBackup(JSON.parse(text));
    if (read.error !== undefined) return null;
    const s = summarise(read.file);
    return {
      name, at: Date.parse(read.file.exportedAt) || fs.statSync(full).mtimeMs, reason: 'manual',
      fingerprint: fingerprint(read.file.data), bytes: Buffer.byteLength(text),
      teams: s.teams, tournaments: s.tournaments, matches: s.matches, drafts: s.drafts
    };
  } catch {
    return null;
  }
}

function fingerprint(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// UTC, so the name sorts and never depends on the PC's calendar (a Thai culture writes
// 2569 for 2026; see docs/PLAN.md §9).
function fileName(at: number, taken: Set<string>): string {
  const iso = new Date(at).toISOString();
  const base = `auto-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
  let name = `${base}.json`;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}.json`;
  return name;
}

export function takeBackup(reason: BackupReason, now = Date.now()): TakeResult {
  // Someone who only ever uses the overlays has no database file, and a backup must not
  // be what creates one (the database opens lazily on purpose; see store/db.ts).
  if (!isDatabaseOpen() && !fs.existsSync(TOURNAMENT_DB_PATH)) return { written: false, skipped: 'empty' };
  try {
    const file = getStores().backup.exportAll(appVersion());
    const s = summarise(file);
    if (s.teams === 0 && s.tournaments === 0) return { written: false, skipped: 'empty' };

    const print = fingerprint(file.data);
    const existing = listBackups();
    if (existing[0] && existing[0].fingerprint === print && reason !== 'before-restore') {
      return { written: false, skipped: 'unchanged' };
    }

    fs.mkdirSync(backupDir(), { recursive: true });
    const name = fileName(now, new Set(existing.map((e) => e.name)));
    const text = JSON.stringify(file);
    const temp = path.join(backupDir(), `${name}.tmp`);
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, path.join(backupDir(), name));

    const entry: AutoBackupEntry = {
      name, at: now, reason, fingerprint: print, bytes: Buffer.byteLength(text),
      teams: s.teams, tournaments: s.tournaments, matches: s.matches, drafts: s.drafts
    };
    const kept = [entry, ...existing].sort((a, b) => b.at - a.at);
    for (const old of kept.slice(KEEP)) {
      try { fs.rmSync(path.join(backupDir(), old.name), { force: true }); } catch { /* next time */ }
    }
    writeJson(indexPath(), kept.slice(0, KEEP));
    checkpoint();
    return { written: true, entry };
  } catch (error) {
    console.warn(`Automatic backup failed: ${(error as Error).message}`);
    return { written: false, skipped: 'failed', error: (error as Error).message };
  }
}

// Folds the WAL into the main file. TRUNCATE also empties the WAL, so the main file alone
// is a complete database again. Harmless when nothing is pending.
export function checkpoint(): void {
  if (!isDatabaseOpen()) return;
  try {
    getDatabase().exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (error) {
    console.warn(`Checkpoint failed: ${(error as Error).message}`);
  }
}

// Adds back what a backup holds and the PC does not: never deletes anything current.
// The current state is backed up first, so a restore can itself be undone.
export function restoreBackup(name: string): { report: RestoreReport } | { error: string; status: number } {
  if (!NAME.test(name)) return { error: 'That is not an automatic backup', status: 400 };
  const full = path.join(backupDir(), name);
  if (!fs.existsSync(full)) return { error: 'That backup is not there any more', status: 404 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return { error: 'That backup file cannot be read', status: 400 };
  }
  const read = readBackup(parsed);
  if (read.error !== undefined) return { error: read.error, status: 400 };

  takeBackup('before-restore');
  const report = getStores().backup.restore(read.file, 'merge');
  notifyData({ topic: 'teams' });
  notifyData({ topic: 'tournaments' });
  notifyData({ topic: 'fonts' });
  checkpoint();
  return { report };
}

let changeTimer: NodeJS.Timeout | null = null;

export function startAutoBackups(): void {
  onDataChange(() => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { changeTimer = null; takeBackup('change'); }, AFTER_CHANGE_MS);
    changeTimer.unref();
  });
  setTimeout(() => takeBackup('start'), 5000).unref();
  setInterval(() => takeBackup('interval'), EVERY_MS).unref();
}
