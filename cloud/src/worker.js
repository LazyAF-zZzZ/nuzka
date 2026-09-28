// Nuzka's key shop: a Cloudflare Worker between the app and Stripe (docs/PLAN.md §10).
//
//   GET /buy?lang=th|en     make a Stripe Checkout Session, send the buyer to it
//   GET /done?session_id=…  ask Stripe whether that session was paid; if so, show the key
//   GET /cancelled          the buyer backed out of Stripe's page
//
// The key is never shown on Stripe's word in the URL: /done asks Stripe directly, with the
// secret API key, and checks the session is a paid Nuzka supporter payment of the right
// amount before signing anything. A made-up or unpaid session id gets no key.
//
// Configuration (wrangler.toml [vars] and secrets):
//   STRIPE_SECRET_KEY   secret, sk_test_… while testing, sk_live_… for real money
//   SIGNING_KEY_PEM     secret, the maker's Ed25519 key (%USERPROFILE%\.rov-supporter\signing-key.pem)
//   PRICE_SATANG        "15900" = ฿159.00 (Stripe counts THB in satang)
//   MONTHS              "1": how long one payment's key lasts
//   PRODUCT_NAME        what Stripe's page and receipt call it

import { signKey, importSigningKey, keyIdFor, bangkokDate, addMonths, cleanName } from './keys.js';
import { createCheckoutSession, getCheckoutSession } from './stripe.js';
import { pickLang, keyPage, waitingPage, cancelledPage, errorPage, homePage } from './pages.js';

export const PRODUCT = 'nuzka-supporter';
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The key page is private to whoever holds the link; nothing should keep a copy.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function settings(env) {
  const price = Number(env.PRICE_SATANG || 15900);
  const months = Number(env.MONTHS || 1);
  if (!Number.isInteger(price) || price < 2000) throw new Error('PRICE_SATANG must be whole satang, at least 2000');
  if (!Number.isInteger(months) || months < 1 || months > 12) throw new Error('MONTHS must be 1 to 12');
  return { price, months, productName: env.PRODUCT_NAME || 'Nuzka supporter, 1 month' };
}

async function buy(url, env, fetcher, lang) {
  const { price, months, productName } = settings(env);
  const origin = url.origin;
  const session = await createCheckoutSession(env, fetcher, {
    mode: 'payment',
    payment_method_types: ['promptpay', 'card'],
    line_items: [{
      quantity: 1,
      price_data: { currency: 'thb', unit_amount: price, product_data: { name: productName } }
    }],
    // The name that goes on the key, shown in the app as "Supporter: <name>".
    custom_fields: [{
      key: 'keyname',
      type: 'text',
      label: { type: 'custom', custom: lang === 'th' ? 'ชื่อบนคีย์ (ทีม / รายการ / ชื่อคุณ)' : 'Name on your key (team, event or you)' },
      text: { maximum_length: 50 }
    }],
    metadata: { product: PRODUCT, months: String(months) },
    locale: lang === 'th' ? 'th' : 'en',
    success_url: `${origin}/done?session_id={CHECKOUT_SESSION_ID}&lang=${lang}`,
    cancel_url: `${origin}/cancelled?lang=${lang}`
  });
  return Response.redirect(session.url, 303);
}

async function done(url, env, fetcher, lang) {
  const id = url.searchParams.get('session_id') || '';
  if (!SESSION_ID.test(id)) return html(errorPage(lang, 'badLink'), 400);

  const session = await getCheckoutSession(env, fetcher, id);
  const { price } = settings(env);

  if (session.metadata?.product !== PRODUCT || session.currency !== 'thb' || !(session.amount_total >= price)) {
    return html(errorPage(lang, 'notOurs'), 403);
  }
  if (session.payment_status !== 'paid') return html(waitingPage(lang), 202);

  // The months paid for travel with the session, so a later price change cannot alter
  // what an earlier payment bought.
  const months = Math.min(12, Math.max(1, Number(session.metadata?.months) || 1));
  const typed = (session.custom_fields || []).find((f) => f.key === 'keyname')?.text?.value;
  const name = cleanName(typed, cleanName(session.customer_details?.name, 'Nuzka supporter'));
  const issued = bangkokDate(session.created * 1000);
  const claims = { id: await keyIdFor(session.id), name, plan: 'supporter', issued, expires: addMonths(issued, months) };

  const key = await signKey(claims, await importSigningKey(env.SIGNING_KEY_PEM));
  return html(keyPage(lang, { key, name, expires: claims.expires }));
}

// Exported so tests can hand in a fetch that answers for Stripe.
export async function handle(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const lang = pickLang(url.searchParams.get('lang'));
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  try {
    if (url.pathname === '/buy') return await buy(url, env, fetcher, lang);
    if (url.pathname === '/done') return await done(url, env, fetcher, lang);
    if (url.pathname === '/cancelled') return html(cancelledPage(lang));
    if (url.pathname === '/') return html(homePage(lang));
    return new Response('Not found', { status: 404 });
  } catch (error) {
    // A session id Stripe has never heard of: a mistyped or made-up link.
    if (error?.status === 404) return html(errorPage(lang, 'badLink'), 404);
    // Stripe's message may carry details meant for the maker, not the buyer.
    console.error('key shop error:', error?.message);
    return html(errorPage(lang, 'stripeDown'), 502);
  }
}

export default {
  fetch: (request, env) => handle(request, env)
};
