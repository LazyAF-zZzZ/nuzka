// The key shop, end to end, with Stripe faked.
//
// The test that matters most is the first one: a key this server makes must pass the
// app's own check (backend/server/domain/supporter.ts, compiled). If the two ever
// disagree about the format, every paying supporter gets a key that does not work.
// Needs `npm run build` in ../backend first.

import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { handle, PRODUCT } from '../src/worker.js';
import { keyIdFor, addMonths, cleanName } from '../src/keys.js';
import { toForm } from '../src/stripe.js';

const require = createRequire(import.meta.url);
const backend = require('../../backend/build/server/domain/supporter.js');

// A throwaway signing pair, as PEM text like the real secret.
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const pem = (label, der) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
const SIGNING_KEY_PEM = pem('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', pair.privateKey));
const PUBLIC_KEY_PEM = pem('PUBLIC KEY', await crypto.subtle.exportKey('spki', pair.publicKey));
backend.useVerifyKeyForTests(PUBLIC_KEY_PEM);

const env = { STRIPE_SECRET_KEY: 'sk_test_fake', SIGNING_KEY_PEM };
const SESSION = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
const PAID_AT = Date.parse('2026-10-05T20:00:00+07:00') / 1000;

function paidSession(over = {}) {
  return {
    id: SESSION, object: 'checkout.session', payment_status: 'paid', currency: 'thb', amount_total: 15900,
    created: PAID_AT, metadata: { product: PRODUCT, months: '1' },
    custom_fields: [{ key: 'keyname', type: 'text', text: { value: '  PSG   Esports ' } }],
    customer_details: { name: 'Somchai' },
    ...over
  };
}

// Answers like Stripe and records what was asked.
function fakeStripe(session, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url, init });
    if (init.method === 'POST' && url.endsWith('/checkout/sessions')) {
      return Response.json({ id: SESSION, url: 'https://checkout.stripe.com/c/pay/' + SESSION });
    }
    if (url.includes('/checkout/sessions/')) {
      if (!session) return Response.json({ error: { message: 'No such checkout.session' } }, { status: 404 });
      return Response.json(session);
    }
    return Response.json({ error: { message: 'unexpected' } }, { status: 500 });
  };
}

const get = (path, fetcher) => handle(new Request('https://keys.example' + path), env, fetcher);
const keyIn = (html) => html.match(/<div class="key" id="key">([^<]+)<\/div>/)?.[1];

test('a paid session gives a key the app accepts, with the name and dates it should have', async () => {
  const reply = await get(`/done?session_id=${SESSION}&lang=en`, fakeStripe(paidSession()));
  assert.strictEqual(reply.status, 200);
  const key = keyIn(await reply.text());
  assert.ok(key?.startsWith('RVS1-'), 'a key is on the page');

  const check = backend.readKey(key);
  assert.ok(check.ok, `the app accepts it (${check.problem})`);
  assert.deepStrictEqual(check.claims, {
    id: await keyIdFor(SESSION),
    name: 'PSG Esports',
    plan: 'supporter',
    issued: '2026-10-05',
    expires: '2026-11-05'
  });
  // Paid late in the evening: the Bangkok date, not the UTC one.
  assert.ok(backend.checkKey(key, Date.parse('2026-11-05T23:59:00+07:00')).ok);
  assert.ok(!backend.checkKey(key, Date.parse('2026-11-06T00:00:01+07:00')).ok);
});

test('opening the page again shows exactly the same key', async () => {
  const first = keyIn(await (await get(`/done?session_id=${SESSION}`, fakeStripe(paidSession()))).text());
  const again = keyIn(await (await get(`/done?session_id=${SESSION}`, fakeStripe(paidSession()))).text());
  assert.strictEqual(first, again);
});

test('no typed name falls back to the payer, then to a plain label', async () => {
  const payer = keyIn(await (await get(`/done?session_id=${SESSION}`, fakeStripe(paidSession({ custom_fields: [] })))).text());
  assert.strictEqual(backend.readKey(payer).claims.name, 'Somchai');
  const nobody = keyIn(await (await get(`/done?session_id=${SESSION}`,
    fakeStripe(paidSession({ custom_fields: [], customer_details: {} })))).text());
  assert.strictEqual(backend.readKey(nobody).claims.name, 'Nuzka supporter');
});

test('a name that is HTML is shown as text, and the key still carries it exactly', async () => {
  const html = await (await get(`/done?session_id=${SESSION}`,
    fakeStripe(paidSession({ custom_fields: [{ key: 'keyname', text: { value: '<img src=x onerror=alert(1)>' } }] })))).text();
  assert.ok(!html.includes('<img src=x'), 'not injected into the page');
  assert.ok(html.includes('&lt;img src=x'));
  assert.strictEqual(backend.readKey(keyIn(html)).claims.name, '<img src=x onerror=alert(1)>');
});

test('not paid yet: a waiting page that refreshes itself, and no key', async () => {
  const reply = await get(`/done?session_id=${SESSION}`, fakeStripe(paidSession({ payment_status: 'unpaid' })));
  assert.strictEqual(reply.status, 202);
  const html = await reply.text();
  assert.ok(!keyIn(html));
  assert.match(html, /http-equiv="refresh" content="5"/);
});

test('someone else\'s payment, the wrong currency or too little money: no key', async () => {
  for (const over of [
    { metadata: { product: 'something-else' } },
    { metadata: {} },
    { currency: 'usd' },
    { amount_total: 100 }
  ]) {
    const reply = await get(`/done?session_id=${SESSION}`, fakeStripe(paidSession(over)));
    assert.strictEqual(reply.status, 403, JSON.stringify(over));
    assert.ok(!keyIn(await reply.text()));
  }
});

test('made-up or broken links never reach a key', async () => {
  for (const id of ['', 'hello', 'cs_live_short', 'cs_test_<script>', 'pi_test_a1B2c3D4e5F6g7H8']) {
    const reply = await get(`/done?session_id=${encodeURIComponent(id)}`, fakeStripe(paidSession()));
    assert.strictEqual(reply.status, 400, id);
  }
  const unknown = await get(`/done?session_id=${SESSION}`, fakeStripe(null));
  assert.strictEqual(unknown.status, 404, 'a well-formed id Stripe does not know');
});

test('Stripe down: an apology page, and Stripe\'s own message stays out of it', async () => {
  const down = async () => Response.json({ error: { message: 'Invalid API Key provided: sk_test_***secret' } }, { status: 401 });
  const reply = await get(`/done?session_id=${SESSION}`, down);
  assert.strictEqual(reply.status, 502);
  assert.ok(!(await reply.text()).includes('API Key'));
});

test('/buy with a plan asks Stripe for a ฿159 PromptPay-or-card payment and sends the buyer there', async () => {
  const calls = [];
  const reply = await get('/buy?plan=month&lang=th', fakeStripe(paidSession(), calls));
  assert.strictEqual(reply.status, 303);
  assert.strictEqual(reply.headers.get('Location'), 'https://checkout.stripe.com/c/pay/' + SESSION);

  const sent = new URLSearchParams(calls[0].init.body);
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer sk_test_fake');
  assert.strictEqual(sent.get('mode'), 'payment');
  assert.strictEqual(sent.get('payment_method_types[0]'), 'promptpay');
  assert.strictEqual(sent.get('payment_method_types[1]'), 'card');
  assert.strictEqual(sent.get('line_items[0][price_data][currency]'), 'thb');
  assert.strictEqual(sent.get('line_items[0][price_data][unit_amount]'), '15900');
  assert.strictEqual(sent.get('metadata[product]'), PRODUCT);
  assert.strictEqual(sent.get('metadata[plan]'), 'month');
  assert.strictEqual(sent.get('metadata[months]'), '1');
  assert.strictEqual(sent.get('custom_fields[0][key]'), 'keyname');
  assert.strictEqual(sent.get('locale'), 'th');
  assert.strictEqual(sent.get('success_url'), 'https://keys.example/done?session_id={CHECKOUT_SESSION_ID}&lang=th');
});

// ---- plans: 1 month ฿159, 3 months ฿430, 1 year ฿1,650 ----

const PLAN_SESSIONS = {
  month: { satang: 15900, months: 1, expires: '2026-11-05' },
  quarter: { satang: 43000, months: 3, expires: '2027-01-05' },
  year: { satang: 165000, months: 12, expires: '2027-10-05' }
};

test('/buy with no plan, or one we do not sell, shows the chooser and never calls Stripe', async () => {
  for (const path of ['/buy', '/buy?lang=th', '/buy?plan=', '/buy?plan=lifetime', '/buy?plan=YEAR']) {
    const calls = [];
    const reply = await get(path, fakeStripe(paidSession(), calls));
    assert.strictEqual(reply.status, 200, path);
    assert.strictEqual(calls.length, 0, path + ' must not create a payment');
    const html = await reply.text();
    for (const plan of Object.keys(PLAN_SESSIONS)) assert.ok(html.includes('plan=' + plan), path + ' offers ' + plan);
  }
});

test('the chooser shows the three prices, and savings worked out from them', async () => {
  const en = await (await get('/buy?lang=en', fakeStripe(null))).text();
  assert.ok(en.includes('฿159') && en.includes('฿430') && en.includes('฿1,650'));
  // 3 months: 3 x 159 = 477, so 430 saves 47. A year: 12 x 159 = 1908, so 1,650 saves 258.
  assert.ok(en.includes('save ฿47'), 'quarter saving');
  assert.ok(en.includes('save ฿258'), 'year saving');
  assert.ok(en.includes('about ฿143 a month') && en.includes('about ฿138 a month'));
  const th = await (await get('/buy?lang=th', fakeStripe(null))).text();
  assert.ok(th.includes('3 เดือน') && th.includes('1 ปี') && th.includes('ประหยัด ฿258'));
  assert.ok(th.includes('plan=year&amp;lang=th'), 'links carry the language');
});

test('each plan asks Stripe for its own amount, name and length', async () => {
  for (const [id, want] of Object.entries(PLAN_SESSIONS)) {
    const calls = [];
    const reply = await get('/buy?plan=' + id, fakeStripe(paidSession(), calls));
    assert.strictEqual(reply.status, 303, id);
    const sent = new URLSearchParams(calls[0].init.body);
    assert.strictEqual(sent.get('line_items[0][price_data][unit_amount]'), String(want.satang), id);
    assert.strictEqual(sent.get('metadata[plan]'), id);
    assert.strictEqual(sent.get('metadata[months]'), String(want.months), id);
    assert.ok(sent.get('line_items[0][price_data][product_data][name]').startsWith('Nuzka supporter'), id);
  }
});

test('a paid 3-month or 1-year session gives a key of that length, and the app accepts it', async () => {
  for (const id of ['quarter', 'year']) {
    const want = PLAN_SESSIONS[id];
    const session = paidSession({ amount_total: want.satang, metadata: { product: PRODUCT, plan: id, months: String(want.months) } });
    const key = keyIn(await (await get(`/done?session_id=${SESSION}`, fakeStripe(session))).text());
    const check = backend.readKey(key);
    assert.ok(check.ok, id + ': ' + check.problem);
    assert.strictEqual(check.claims.expires, want.expires, id);
    assert.ok(backend.checkKey(key, Date.parse(want.expires + 'T23:59:00+07:00')).ok, id + ' valid on its last day');
    assert.ok(!backend.checkKey(key, Date.parse(want.expires + 'T23:59:00+07:00') + 2 * 60 * 1000).ok, id + ' over the next day');
  }
});

test('a cheap payment cannot be passed off as a longer plan', async () => {
  // Someone tampers with nothing Stripe holds, so the realistic risk is our own bookkeeping:
  // a session that names the year but only paid for a month, or the quarter price.
  for (const [plan, paid] of [['year', 15900], ['year', 43000], ['quarter', 15900], ['year', 164999]]) {
    const session = paidSession({ amount_total: paid, metadata: { product: PRODUCT, plan, months: '12' } });
    const reply = await get(`/done?session_id=${SESSION}`, fakeStripe(session));
    assert.strictEqual(reply.status, 403, `${plan} for ${paid}`);
    assert.ok(!keyIn(await reply.text()));
  }
});

test('the length comes from the plan, not from the months written in the session', async () => {
  const session = paidSession({ amount_total: 15900, metadata: { product: PRODUCT, plan: 'month', months: '12' } });
  const key = keyIn(await (await get(`/done?session_id=${SESSION}`, fakeStripe(session))).text());
  assert.strictEqual(backend.readKey(key).claims.expires, '2026-11-05', 'a month, whatever the metadata says');
});

test('an unknown plan in a session is refused', async () => {
  const session = paidSession({ amount_total: 999999, metadata: { product: PRODUCT, plan: 'lifetime', months: '12' } });
  assert.strictEqual((await get(`/done?session_id=${SESSION}`, fakeStripe(session))).status, 403);
});

test('sessions made before there were plans still give their 1-month key', async () => {
  const legacy = paidSession({ metadata: { product: PRODUCT, months: '1' } });
  const reply = await get(`/done?session_id=${SESSION}`, fakeStripe(legacy));
  assert.strictEqual(reply.status, 200);
  assert.strictEqual(backend.readKey(keyIn(await reply.text())).claims.expires, '2026-11-05');
});

test('a price can be changed with a variable, and a bad one is an error, not a free key', async () => {
  const reply = await handle(new Request('https://keys.example/buy?plan=year'), { ...env, PRICE_YEAR_SATANG: '99000' }, fakeStripe(paidSession(), []));
  assert.strictEqual(reply.status, 303);
  const bad = await handle(new Request('https://keys.example/buy?plan=year'), { ...env, PRICE_YEAR_SATANG: '12.5' }, fakeStripe(paidSession(), []));
  assert.strictEqual(bad.status, 502, 'refused, not charged at some default');
});

test('Thai pages are Thai, with Buddhist-era dates', async () => {
  const html = await (await get(`/done?session_id=${SESSION}&lang=th`, fakeStripe(paidSession()))).text();
  assert.ok(html.includes('ขอบคุณที่สนับสนุน Nuzka'));
  assert.ok(html.includes('2569'), 'the year as Thai people write it');
});

test('helpers: month arithmetic and names', () => {
  assert.strictEqual(addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(addMonths('2026-12-15', 1), '2027-01-15');
  assert.strictEqual(cleanName('   ', 'x'), 'x');
  assert.strictEqual(cleanName('a'.repeat(80), 'x').length, 60);
  assert.strictEqual(toForm({ a: [{ b: 1 }], c: 'd' }).toString(), 'a%5B0%5D%5Bb%5D=1&c=d');
});
