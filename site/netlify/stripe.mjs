// ─────────────────────────────────────────────────────────────────────────
// Minimal Stripe API client — dependency-free (raw fetch + node:crypto), so
// there is no npm package to install/bundle. Used by the direct-booking flow:
//   • create Checkout Sessions for the deposit (saving the card off-session)
//   • charge the balance later with an off-session PaymentIntent
//   • verify incoming webhook signatures
//
// The secret key lives ONLY in the STRIPE_SECRET_KEY environment variable —
// never in the repo or any page source. The webhook signing secret is
// STRIPE_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

export class StripeError extends Error {
  constructor(message, code = 'stripe_error', raw = null, status = 0) {
    super(message);
    this.name = 'StripeError';
    this.code = code;
    this.raw = raw;
    this.status = status;
  }
}

export function stripeConfigured() {
  return Boolean(Netlify.env.get('STRIPE_SECRET_KEY'));
}

// Flatten a nested object/array into Stripe's bracketed form-encoding, e.g.
//   { a: { b: 1 }, c: [2, 3] } → "a[b]=1&c[0]=2&c[1]=3".
function encode(obj, prefix, out) {
  out = out || [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v !== null && typeof v === 'object') encode(v, `${k}[${i}]`, out);
        else out.push(`${encodeURIComponent(k + '[' + i + ']')}=${encodeURIComponent(v)}`);
      });
    } else if (typeof val === 'object') {
      encode(val, k, out);
    } else {
      out.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
    }
  }
  return out;
}
export function formEncode(params) {
  return encode(params).join('&');
}

// Call the Stripe REST API. `path` is like 'checkout/sessions' or
// 'payment_intents/pi_123'. GET requests put params in the query string.
export async function stripe(path, { method = 'POST', params = {}, idempotencyKey } = {}) {
  const secret = Netlify.env.get('STRIPE_SECRET_KEY');
  if (!secret) throw new StripeError('Stripe is not configured (STRIPE_SECRET_KEY missing).', 'no_key');

  let url = 'https://api.stripe.com/v1/' + path;
  const headers = { Authorization: `Bearer ${secret}` };
  let body;
  if (method === 'GET') {
    const qs = formEncode(params);
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = formEncode(params);
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (err) {
    throw new StripeError('Could not reach Stripe: ' + err.message, 'network');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* keep {} */
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new StripeError(e.message || `Stripe responded ${res.status}`, e.code || 'stripe_error', e, res.status);
  }
  return data;
}

// Verify a Stripe webhook signature (the "Signing secret" from the dashboard).
// Returns the parsed event object, or throws if the signature is invalid or the
// timestamp is outside the tolerance window.
export function constructWebhookEvent(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!secret) throw new StripeError('Webhook secret not configured (STRIPE_WEBHOOK_SECRET).', 'no_webhook_secret');
  if (!sigHeader) throw new StripeError('Missing Stripe-Signature header.', 'no_signature');

  let t;
  const v1s = [];
  for (const item of String(sigHeader).split(',')) {
    const i = item.indexOf('=');
    if (i === -1) continue;
    const k = item.slice(0, i).trim();
    const v = item.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) throw new StripeError('Malformed Stripe signature.', 'bad_signature');

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const expBuf = Buffer.from(expected, 'hex');
  const matched = v1s.some((v) => {
    let vb;
    try {
      vb = Buffer.from(v, 'hex');
    } catch {
      return false;
    }
    return vb.length === expBuf.length && crypto.timingSafeEqual(vb, expBuf);
  });
  if (!matched) throw new StripeError('Signature verification failed.', 'bad_signature');

  const age = Math.floor(Date.now() / 1000) - Number(t);
  if (!Number.isFinite(age) || Math.abs(age) > toleranceSec) {
    throw new StripeError('Webhook timestamp outside tolerance.', 'stale');
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new StripeError('Webhook payload was not valid JSON.', 'bad_payload');
  }
}
