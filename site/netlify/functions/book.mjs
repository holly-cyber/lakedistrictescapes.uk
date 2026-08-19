import { quoteStay, isAvailable, createCheckout, findBySessionPublic } from '../direct-bookings.mjs';
import { stripeConfigured } from '../stripe.mjs';
import { PRICING, PROPERTIES } from '../management-data.mjs';

// Netlify Function (v2) — PUBLIC direct-booking API for the /book page.
//
//   POST /api/book  body: { action, ... }
//     action 'config'   → { configured, properties }         (bookable list + rules)
//     action 'quote'    → { ok, quote } | { error }          (price + availability)
//     action 'checkout' → { ok, url } | { error }            (start Stripe deposit)
//
// No access code — this is the guest-facing booking flow. Prices are ALWAYS
// computed on the server from PRICING; the client never sends an amount.

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function publicConfig() {
  const properties = {};
  for (const [key, cfg] of Object.entries(PRICING)) {
    if (!cfg.bookable || !PROPERTIES[key]) continue;
    properties[key] = {
      key,
      name: PROPERTIES[key].name,
      short: PROPERTIES[key].short,
      nightly: cfg.nightly,
      cleaningFee: cfg.cleaningFee || 0,
      minNights: cfg.minNights,
      maxGuests: cfg.maxGuests,
      depositPct: cfg.depositPct,
      balanceDueDays: cfg.balanceDueDays,
      currency: cfg.currency || 'GBP',
    };
  }
  return properties;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const action = String(body?.action || 'quote');

  if (action === 'config') {
    return json({ configured: stripeConfigured(), properties: publicConfig() });
  }

  if (action === 'quote') {
    const q = quoteStay(body);
    if (q.error) return json({ error: q.error }, 400);
    let available = true;
    try {
      available = await isAvailable(q.quote.property, q.quote.start, q.quote.end);
    } catch {
      /* if the check fails, don't block the quote; checkout re-checks */
    }
    return json({ ok: true, quote: q.quote, available });
  }

  if (action === 'lookup') {
    const sessionId = String(body.session_id || body.sessionId || '');
    const rec = await findBySessionPublic(sessionId);
    if (!rec) return json({ ok: false, notFound: true });
    return json({ ok: true, booking: rec });
  }

  if (action === 'checkout') {
    if (!stripeConfigured()) {
      return json({ error: 'Online booking isn’t switched on yet. Please use the enquiry form.' }, 503);
    }
    const origin = originOf(req);
    const r = await createCheckout(body, origin);
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, url: r.url, ref: r.ref });
  }

  return json({ error: 'Unknown action.' }, 400);
};

function originOf(req) {
  try {
    const o = req.headers.get('origin');
    if (o) return o;
    const host = req.headers.get('host');
    if (host) return (host.startsWith('localhost') ? 'http://' : 'https://') + host;
  } catch {
    /* ignore */
  }
  return null;
}

export const config = {
  path: '/api/book',
};
