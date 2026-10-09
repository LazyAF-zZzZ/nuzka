// Nuzka's key shop: a Cloudflare Worker between the app and Stripe (docs/PLAN.md §10).
//
//   GET /buy?lang=th|en     the plan chooser (1 month, 3 months, 1 year)
//   GET /buy?plan=month|quarter|year&lang=th|en
//                           make a Stripe Checkout Session for that plan, send the buyer to it
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
//   PRICE_SATANG        "15900"  = ฿159.00, 1 month (Stripe counts THB in satang)
//   PRICE_QUARTER_SATANG "43000" = ฿430.00, 3 months
//   PRICE_YEAR_SATANG   "165000" = ฿1,650.00, 1 year
// How long each plan's key lasts is fixed in PLANS below, not configurable: the key's length
// must follow from the plan, never from a variable that could drift from what was charged.

import { signKey, importSigningKey, keyIdFor, bangkokDate, addMonths, cleanName } from './keys.js';
import { createCheckoutSession, getCheckoutSession } from './stripe.js';
import { pickLang, keyPage, waitingPage, cancelledPage, errorPage, homePage, planPage } from './pages.js';

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

// What can be bought. `months` is how long the key lasts and is part of the plan, so a plan's
// length can never disagree with its price. The price comes from the variable (so it can change
// with a deploy); the default is what the app's Support screen shows (SupporterOffer.cs).
export const PLANS = [
  { id: 'month', months: 1, satang: 15900, variable: 'PRICE_SATANG', productName: 'Nuzka supporter, 1 month' },
  { id: 'quarter', months: 3, satang: 43000, variable: 'PRICE_QUARTER_SATANG', productName: 'Nuzka supporter, 3 months' },
  { id: 'year', months: 12, satang: 165000, variable: 'PRICE_YEAR_SATANG', productName: 'Nuzka supporter, 1 year' }
];

export function plansFor(env) {
  return PLANS.map((plan) => {
    const price = Number(env[plan.variable] || plan.satang);
    if (!Number.isInteger(price) || price < 2000) throw new Error(`${plan.variable} must be whole satang, at least 2000`);
    return { id: plan.id, months: plan.months, price, productName: plan.productName };
  });
}

async function buy(url, env, fetcher, lang) {
  const plans = plansFor(env);
  // No plan, or one we do not sell: show the chooser rather than guess what the buyer meant.
  const plan = plans.find((p) => p.id === url.searchParams.get('plan'));
  if (!plan) return html(planPage(lang, plans));
  const { price, months, productName } = plan;
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
    metadata: { product: PRODUCT, plan: plan.id, months: String(months) },
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
  // Sessions made before there were plans have no plan: they were the 1-month payment.
  const plan = plansFor(env).find((p) => p.id === (session.metadata?.plan || 'month'));

  // The amount must cover the price of the plan the session says it is for. That is what ties
  // the length of the key to the money: a 1-month payment cannot be presented as a year.
  if (session.metadata?.product !== PRODUCT || !plan || session.currency !== 'thb' || !(session.amount_total >= plan.price)) {
    return html(errorPage(lang, 'notOurs'), 403);
  }
  if (session.payment_status !== 'paid') return html(waitingPage(lang), 202);

  // Length comes from the plan's table entry, never from the months written in the session.
  const months = plan.months;
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
