// The two Stripe calls the server needs, over plain fetch: no Stripe library, so nothing
// to bundle and nothing that assumes Node.
//
// The fetch function is passed in, so tests can answer for Stripe without a network.

const API = 'https://api.stripe.com/v1';

// Stripe takes form encoding with bracketed keys: line_items[0][price_data][currency]=thb.
export function toForm(value, prefix = '', out = new URLSearchParams()) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => toForm(item, `${prefix}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) toForm(item, prefix ? `${prefix}[${key}]` : key, out);
  } else if (value !== undefined) {
    out.append(prefix, String(value));
  }
  return out;
}

async function call(env, fetcher, method, path, body) {
  const reply = await fetcher(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: body ? toForm(body).toString() : undefined
  });
  const data = await reply.json().catch(() => ({}));
  if (!reply.ok) {
    const error = new Error(data?.error?.message || `Stripe answered ${reply.status}`);
    error.status = reply.status;
    throw error;
  }
  return data;
}

export function createCheckoutSession(env, fetcher, params) {
  return call(env, fetcher, 'POST', '/checkout/sessions', params);
}

export function getCheckoutSession(env, fetcher, id) {
  return call(env, fetcher, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}
