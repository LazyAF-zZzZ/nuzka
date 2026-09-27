// The supporter key this install holds, and what it currently means.
//
// Two files in the user data folder:
//   supporter.json     { key } - the pasted key, exactly as checked
//   revoked-keys.json  [ids]   - the last revoked list we managed to download
//
// The revoked list is fetched from the public repo when online. The copy on disk is what
// keeps a revoked key revoked offline; losing the network must never restore it, and
// must never switch off a good one either.
//
// Nothing here reads the clock on import, so a key that runs out while the app is open
// is noticed by the hourly re-check in startSupporterWatch, not by a restart.

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';
import { loadJson, writeJson } from '../lib/json';
import { checkKey, expiresAt, normaliseKey, KeyCheck, KeyProblem } from '../domain/supporter';

export const REVOKED_LIST_URL =
  'https://raw.githubusercontent.com/LazyAF-zZzZ/rov_overlay_v3/main/revoked-keys.json';

const DAY = 24 * 60 * 60 * 1000;

export interface SupporterStatus {
  active: boolean;
  state: 'none' | 'active' | KeyProblem;
  name?: string;
  plan?: string;
  expires?: string;
  daysLeft?: number;
}

type Listener = (status: SupporterStatus) => void;

// Paths are worked out on use, not on import: tests point DATA_DIR at a temp folder
// by setting the environment before they load the server.
const keyPath = (): string => path.join(DATA_DIR, 'supporter.json');
const revokedPath = (): string => path.join(DATA_DIR, 'revoked-keys.json');

let loaded = false;
let storedKey = '';
let revoked = new Set<string>();
let lastStatus = '';
const listeners: Listener[] = [];

function load(): void {
  if (loaded) return;
  loaded = true;
  const saved = loadJson(keyPath(), {}, { quiet: true }) as { key?: unknown };
  storedKey = typeof saved?.key === 'string' ? saved.key : '';
  revoked = toIdSet(loadJson(revokedPath(), [], { quiet: true }));
}

function toIdSet(list: unknown): Set<string> {
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 32));
}

export function supporterStatus(now = Date.now()): SupporterStatus {
  load();
  if (!storedKey) return { active: false, state: 'none' };
  return describe(checkKey(storedKey, now, revoked), now);
}

function describe(check: KeyCheck, now: number): SupporterStatus {
  if (!check.claims) return { active: false, state: check.ok ? 'active' : check.problem };
  const { name, plan, expires } = check.claims;
  const daysLeft = Math.max(0, Math.ceil((expiresAt(expires) - now) / DAY));
  return {
    active: check.ok,
    state: check.ok ? 'active' : check.problem,
    name, plan, expires, daysLeft
  };
}

// Only a key that works today is kept. An expired or revoked one is refused with the
// reason, so the operator hears "this key ran out on…" instead of watching the
// watermark stay put with no explanation.
export function saveSupporterKey(raw: unknown, now = Date.now()):
  { ok: true; status: SupporterStatus } | { ok: false; problem: KeyProblem; status?: SupporterStatus } {
  load();
  const check = checkKey(raw, now, revoked);
  if (!check.ok) {
    return { ok: false, problem: check.problem, ...(check.claims ? { status: describe(check, now) } : {}) };
  }
  storedKey = normaliseKey(raw);
  writeJson(keyPath(), { key: storedKey });
  notify(now);
  return { ok: true, status: supporterStatus(now) };
}

export function removeSupporterKey(now = Date.now()): SupporterStatus {
  load();
  storedKey = '';
  try {
    fs.rmSync(keyPath(), { force: true });
  } catch (error) {
    console.warn(`Could not remove the supporter key: ${(error as Error).message}`);
  }
  notify(now);
  return supporterStatus(now);
}

// Replaces the revoked list with a freshly downloaded one. Anything that is not a list
// of ids is ignored, so a broken download or a captive-portal login page can never
// empty the list and bring a revoked key back.
export function setRevokedIds(list: unknown, now = Date.now()): boolean {
  load();
  if (!Array.isArray(list)) return false;
  revoked = toIdSet(list);
  writeJson(revokedPath(), [...revoked]);
  notify(now);
  return true;
}

export function onSupporterChange(listener: Listener): void {
  listeners.push(listener);
}

// Tells listeners only when something they can see changed, so the hourly re-check
// does not push to every overlay for nothing.
function notify(now: number): void {
  const status = supporterStatus(now);
  const signature = JSON.stringify({ ...status, daysLeft: undefined });
  if (signature === lastStatus) return;
  lastStatus = signature;
  listeners.forEach((listener) => listener(status));
}

export async function refreshRevokedList(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const reply = await fetcher(REVOKED_LIST_URL, { signal: AbortSignal.timeout(15000) });
    if (!reply.ok) return false;
    return setRevokedIds(await reply.json());
  } catch {
    // Offline, or GitHub unreachable: the list on disk stays in force.
    return false;
  }
}

// Called once by start(), never by createApp(), so tests never touch the network.
export function startSupporterWatch(): void {
  load();
  lastStatus = JSON.stringify({ ...supporterStatus(), daysLeft: undefined });
  void refreshRevokedList();
  setInterval(() => void refreshRevokedList(), 6 * 60 * 60 * 1000).unref();
  setInterval(() => notify(Date.now()), 60 * 60 * 1000).unref();
}

// Tests only: forget what was loaded so the next call reads the files again.
export function resetSupporterForTests(): void {
  loaded = false;
  storedKey = '';
  revoked = new Set();
  lastStatus = '';
}
