// Supporter keys, made by the server the moment Stripe confirms a payment.
//
// The format is exactly backend/server/domain/supporter.ts's, which is what checks them:
//
//   RVS1-<base64url JSON {v,id,n,p,i,e}>.<base64url Ed25519 signature over "RVS1-<body>">
//
// Nothing about a key is random. The id comes from the Stripe Checkout Session id and the
// dates from when it was paid, and Ed25519 signatures are deterministic, so the same
// payment always gives the same key: the thank-you page can be opened again, and the
// maker can recover a lost key from the payment alone. No database.
//
// Web Crypto only (no Node APIs), so the same file runs on Cloudflare Workers and under
// `node --test`.

export const KEY_PREFIX = 'RVS1-';

const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The maker's secret half, as the PKCS#8 PEM that tools/supporter-keys.js init wrote.
// It reaches the server as a Worker secret, never as a file in the repo.
export async function importSigningKey(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
}

export async function signKey(claims, signingKey) {
  const wire = { v: 1, id: claims.id, n: claims.name, p: claims.plan, i: claims.issued, e: claims.expires };
  const body = base64url(encoder.encode(JSON.stringify(wire)));
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, signingKey, encoder.encode(KEY_PREFIX + body));
  return `${KEY_PREFIX}${body}.${base64url(signature)}`;
}

// 12 hex characters of SHA-256(session id): what revoked-keys.json lists to switch a key
// off, and computable by the maker from the payment in the Stripe dashboard.
export async function keyIdFor(sessionId) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(sessionId));
  return [...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Keys run to the end of a Bangkok day (backend expiresAt), so dates are Bangkok dates.
export function bangkokDate(ms) {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Same arithmetic as tools/supporter-keys.js: 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// The name the buyer typed for their key. The backend refuses an empty name or one over
// 60 characters, so a key that would fail its own check is never made.
export function cleanName(raw, fallback) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return name || fallback;
}
