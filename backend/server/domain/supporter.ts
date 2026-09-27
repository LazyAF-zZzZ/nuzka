// Supporter keys: what one looks like and whether it is genuine.
//
// A supporter pays the maker and gets a key that hides the watermark on the overlays.
// Nothing else depends on it. The key carries its own claims (who, which plan, until
// when) and an Ed25519 signature over them, so checking it needs no server and no
// network: a broadcast must never depend on the internet (docs/PLAN.md §10).
//
//   RVS1-<claims, base64url JSON>.<signature, base64url>
//
// The signature covers "RVS1-<claims>", prefix included, so a later format cannot be
// passed off as this one. Only the maker's PUBLIC key is here. The secret half lives
// on the maker's PC, never in this repo (tools/supporter-keys.js).
//
// This module is pure: no files, no clock of its own, no state. The store decides what
// is saved and when to check again.

import crypto, { KeyObject } from 'crypto';

export const KEY_PREFIX = 'RVS1-';

const MAKER_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAsEF/lhIO5wbBCjpehr3e/FxedOsdcFlaLC/2R87twuc=
-----END PUBLIC KEY-----`;

let verifyKey: KeyObject | null = null;

function makerKey(): KeyObject {
  if (!verifyKey) verifyKey = crypto.createPublicKey(MAKER_PUBLIC_KEY_PEM);
  return verifyKey;
}

// Tests sign with a throwaway pair. Deliberately a function and not an environment
// variable: an env override would let anyone start the server with their own public
// key and sign keys for themselves without touching the code.
export function useVerifyKeyForTests(key: KeyObject | string): void {
  verifyKey = typeof key === 'string' ? crypto.createPublicKey(key) : key;
}

export interface SupporterClaims {
  id: string;       // short random id, what the revoked list names
  name: string;     // shown in the app: "Supporter: Team X"
  plan: string;     // 'supporter' for now; room for tiers later
  issued: string;   // YYYY-MM-DD
  expires: string;  // YYYY-MM-DD, the last day the key works, Bangkok time
}

export type KeyProblem = 'format' | 'signature' | 'expired' | 'revoked';

export type KeyCheck =
  | { ok: true; claims: SupporterClaims }
  | { ok: false; problem: KeyProblem; claims?: SupporterClaims };

// On the wire the claims use one-letter names: a key is pasted from LINE or email, and
// every character is one more to lose in a copy.
interface WireClaims { v: number; id: string; n: string; p: string; i: string; e: string }

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9]{1,32}$/;

// Keys arrive through chat apps that wrap long lines and add spaces. None of the
// characters a key uses is whitespace, so all of it can go.
export function normaliseKey(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// The key works to the end of its last day in Thailand, where the maker and nearly
// every buyer are. A plain UTC date would switch a key off at 7 in the morning.
export function expiresAt(date: string): number {
  return Date.parse(`${date}T23:59:59.999+07:00`);
}

function toClaims(wire: unknown): SupporterClaims | null {
  if (!wire || typeof wire !== 'object') return null;
  const w = wire as Partial<WireClaims>;
  if (w.v !== 1) return null;
  if (typeof w.id !== 'string' || !ID.test(w.id)) return null;
  if (typeof w.n !== 'string' || !w.n.trim() || w.n.length > 60) return null;
  if (typeof w.p !== 'string' || !w.p || w.p.length > 20) return null;
  if (!isDate(w.i) || !isDate(w.e)) return null;
  return { id: w.id, name: w.n.trim(), plan: w.p, issued: w.i, expires: w.e };
}

// Genuine or not, ignoring the date. Split from checkKey so the store can tell
// "this key has run out" from "this is not a key".
export function readKey(raw: unknown): KeyCheck {
  const key = normaliseKey(raw);
  if (!key.startsWith(KEY_PREFIX)) return { ok: false, problem: 'format' };

  const parts = key.slice(KEY_PREFIX.length).split('.');
  if (parts.length !== 2) return { ok: false, problem: 'format' };
  const [body, sig] = parts as [string, string];
  if (!BASE64URL.test(body) || !BASE64URL.test(sig)) return { ok: false, problem: 'format' };

  const signature = Buffer.from(sig, 'base64url');
  if (signature.length !== 64) return { ok: false, problem: 'format' };

  // Signature first, and only then parse: nothing a stranger wrote gets interpreted
  // before we know the maker signed it.
  let genuine = false;
  try {
    genuine = crypto.verify(null, Buffer.from(KEY_PREFIX + body), makerKey(), signature);
  } catch {
    genuine = false;
  }
  if (!genuine) return { ok: false, problem: 'signature' };

  let wire: unknown;
  try {
    wire = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, problem: 'format' };
  }
  const claims = toClaims(wire);
  return claims ? { ok: true, claims } : { ok: false, problem: 'format' };
}

export function checkKey(
  raw: unknown,
  now: number,
  revoked: ReadonlySet<string> = new Set()
): KeyCheck {
  const read = readKey(raw);
  if (!read.ok) return read;
  if (revoked.has(read.claims.id)) return { ok: false, problem: 'revoked', claims: read.claims };
  if (now > expiresAt(read.claims.expires)) return { ok: false, problem: 'expired', claims: read.claims };
  return read;
}

// Used by the maker's key tool and by the tests; the running app never signs.
export function signKey(claims: SupporterClaims, secretKey: KeyObject | string): string {
  const wire: WireClaims = {
    v: 1, id: claims.id, n: claims.name, p: claims.plan, i: claims.issued, e: claims.expires
  };
  if (!toClaims(wire)) throw new Error('Those supporter details are not valid');
  const body = Buffer.from(JSON.stringify(wire), 'utf8').toString('base64url');
  const key = typeof secretKey === 'string' ? crypto.createPrivateKey(secretKey) : secretKey;
  const signature = crypto.sign(null, Buffer.from(KEY_PREFIX + body), key);
  return `${KEY_PREFIX}${body}.${signature.toString('base64url')}`;
}

export function newKeyId(): string {
  return crypto.randomBytes(6).toString('hex');
}
