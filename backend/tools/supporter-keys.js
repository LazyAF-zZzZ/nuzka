// The maker's supporter-key tool. Runs on the maker's PC only; never shipped
// (scripts/pack.ps1 copies build/, public/ and server.js, not tools/).
//
//   node tools/supporter-keys.js init
//       Creates the signing pair once. The SECRET half goes to
//       %USERPROFILE%\.rov-supporter\signing-key.pem, outside this public repo.
//       Prints the public half, which belongs in server/domain/supporter.ts.
//
//   node tools/supporter-keys.js make --name "Team X" --months 12 [--plan supporter]
//   node tools/supporter-keys.js make --name "Team X" --until 2027-01-31
//       Prints a key to send to a supporter.
//
//   node tools/supporter-keys.js read <key>
//       Shows what a key says and whether this build accepts it.
//
//   node tools/supporter-keys.js shop-id <cs_live_...>
//       The key id of a key the key shop (cloud/) made for that Stripe Checkout Session,
//       to put in revoked-keys.json after a refund. Same rule as cloud/src/keys.js.
//
// Lose signing-key.pem and no new key can be made that existing installs accept. Back it
// up somewhere private. Leak it and anyone can make keys: make a new pair, ship an
// update with the new public key, and reissue keys to current supporters.
//
// Needs `npm run build` first: it signs with the same code the app verifies with, so the
// two can never disagree about the format.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const COMPILED = path.join(__dirname, '..', 'build', 'server', 'domain', 'supporter.js');
const SECRET_DIR = path.join(os.homedir(), '.rov-supporter');
const SECRET_PATH = path.join(SECRET_DIR, 'signing-key.pem');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function args(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].startsWith('--')) out[list[i].slice(2)] = list[i + 1];
  }
  return out;
}

// Today in Thailand, as YYYY-MM-DD: keys run to the end of a Bangkok day.
function bangkokDate(date) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function init() {
  if (fs.existsSync(SECRET_PATH)) {
    fail(`A signing key already exists at ${SECRET_PATH}. Refusing to replace it: every key made with it would stop working.`);
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(SECRET_DIR, { recursive: true });
  fs.writeFileSync(SECRET_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Secret key written to ${SECRET_PATH}`);
  console.log('Back it up somewhere private. Never commit it, never send it to anyone.\n');
  console.log('Public key for server/domain/supporter.ts:\n');
  console.log(publicKey.export({ type: 'spki', format: 'pem' }));
}

function make(options) {
  if (!fs.existsSync(COMPILED)) fail('Run `npm run build` first.');
  if (!fs.existsSync(SECRET_PATH)) fail(`No signing key at ${SECRET_PATH}. Run \`init\` first.`);
  const { signKey, readKey, newKeyId } = require(COMPILED);

  const name = (options.name || '').trim();
  if (!name) fail('--name is required, e.g. --name "Team X"');

  const issued = bangkokDate(new Date());
  let expires = options.until;
  if (!expires) {
    const months = Number(options.months || 12);
    if (!Number.isInteger(months) || months < 1 || months > 60) fail('--months must be a whole number from 1 to 60');
    expires = addMonths(issued, months);
  }

  const secret = fs.readFileSync(SECRET_PATH, 'utf8');
  const claims = { id: newKeyId(), name, plan: options.plan || 'supporter', issued, expires };
  const key = signKey(claims, secret);

  // A key this build would reject is worse than no key: check before handing it out.
  const check = readKey(key);
  if (!check.ok) {
    fail(`The key did not pass this build's own check (${check.problem}). Is the public key in server/domain/supporter.ts the one for ${SECRET_PATH}?`);
  }

  console.log(`Supporter: ${claims.name}`);
  console.log(`Key id:    ${claims.id}   (put this in revoked-keys.json to switch the key off)`);
  console.log(`Valid:     ${claims.issued} to ${claims.expires} (Bangkok time)\n`);
  console.log(key);
}

function read(key) {
  if (!fs.existsSync(COMPILED)) fail('Run `npm run build` first.');
  const { readKey, checkKey } = require(COMPILED);
  const genuine = readKey(key);
  if (!genuine.ok) fail(`Not accepted: ${genuine.problem}`);
  const today = checkKey(key, Date.now());
  console.log(genuine.claims);
  console.log(today.ok ? 'Works today.' : `Not working today: ${today.problem}`);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'init') init();
else if (command === 'make') make(args(rest));
else if (command === 'read') read(rest[0]);
else if (command === 'shop-id') {
  if (!/^cs_(test|live)_/.test(rest[0] || '')) fail('Give the Checkout Session id from the Stripe dashboard, e.g. cs_live_a1B2...');
  console.log(crypto.createHash('sha256').update(rest[0]).digest('hex').slice(0, 12));
}
else fail('Usage: node tools/supporter-keys.js init | make --name "Team X" [--months 12 | --until YYYY-MM-DD] | read <key> | shop-id <cs_...>');
