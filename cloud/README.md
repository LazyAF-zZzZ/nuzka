# Nuzka key shop

A Cloudflare Worker that sells Nuzka supporter keys through Stripe. The app's
**Support → Get a key** button opens `<shop>/buy`; Stripe takes PromptPay or a card; the
shop checks with Stripe that the payment is real and shows the key at once.

No database: a key is made from its Stripe payment, so the same payment always gives the
same key. The thank-you link can be reopened, and a lost key can be recovered from the
payment in the Stripe dashboard.

```
src/worker.js   routes: /buy, /done, /cancelled
src/keys.js     the key format (same as backend/server/domain/supporter.ts)
src/stripe.js   the two Stripe API calls
src/pages.js    the pages buyers see, Thai and English
test/           npm test (needs `npm run build` in ../backend first)
```

## One-time setup (the maker does this)

### 1. Stripe

1. Sign up at stripe.com. Country **Thailand**, business type **Individual / sole
   proprietor**. Stripe asks for your ID, a Thai bank account for payouts, and a website:
   the GitHub repo page is fine.
2. **Settings → Payment methods**: switch on **PromptPay** (cards are on already).
3. **Developers → API keys**: you will need the **secret key**. Start with the **test**
   one (`sk_test_...`). Never paste it into chat, a file in this repo, or the app.
   For real money, create a **restricted** live key instead of using the full secret key:
   Developers → API keys → Create restricted key → Custom permissions → **Checkout
   Sessions: Write**, everything else None (`rk_live_...`). That is all the shop needs.

### 2. Cloudflare

1. Sign up at cloudflare.com (free plan).
2. In this folder, in your own terminal:

   ```bash
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put SIGNING_KEY_PEM
   ```

   `secret put` asks you to paste the value: the Stripe secret key, then the whole
   contents of `%USERPROFILE%\.rov-supporter\signing-key.pem` (from `-----BEGIN` to
   `-----END PRIVATE KEY-----`).
3. `deploy` prints the shop's address, e.g. `https://nuzka-keys.<you>.workers.dev`. That
   goes into the app as `SupporterOffer.ShopUrl` (desktop/RovOverlay.Desktop/Services/SupporterOffer.cs).

### 3. Test before real money

With the **test** Stripe key: open `<shop>/buy`, pay with card `4242 4242 4242 4242` (any
future date, any CVC) or Stripe's test PromptPay, and paste the key into Nuzka. When that
works, swap in the **live** key with `npx wrangler secret put STRIPE_SECRET_KEY` again.

## Running it

- **Price**: `PRICE_SATANG` in `wrangler.toml` (15900 = ฿159), then `npx wrangler deploy`.
  Keep `SupporterOffer.MonthlyPrice` in the app the same, since that is only the label.
- **Refund or a leaked key**: find the payment's Checkout Session id (`cs_live_...`) in the
  Stripe dashboard, run `node backend/tools/supporter-keys.js shop-id cs_live_...`, and put
  the id it prints in `revoked-keys.json`.
- **Lost key**: open `<shop>/done?session_id=cs_live_...` with the buyer's session id; it
  shows the same key again.

## What the secrets are

- `STRIPE_SECRET_KEY` can move money in your Stripe account.
- `SIGNING_KEY_PEM` can make keys the app accepts. It now lives in two places, your PC and
  Cloudflare's secret store. If either leaks: `init` a new pair, ship an app update with
  the new public key, `secret put` the new secret, and reissue current supporters' keys.
