import { quoteStay, isAvailable, createCheckout, findBySessionPublic, cancellationPolicy } from '../direct-bookings.mjs';
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

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Owner override: when a valid override code is supplied, availability
// (including Airbnb "Not available" blocks) is bypassed so the owner can book a
// date they've deliberately held. Uses a DEDICATED BOOKING_OVERRIDE_CODE so the
// management dashboard code never has to appear in a booking URL; the management
// code is also accepted as a fallback if no dedicated code is set.
function ownerOverride(body) {
  const code = String(body?.override || '').trim();
  if (!code) return false;
  const lc = code.toLowerCase();
  for (const name of ['BOOKING_OVERRIDE_CODE', 'MANAGEMENT_ACCESS_CODE']) {
    const expected = Netlify.env.get(name);
    if (expected && safeEqual(lc, expected.trim().toLowerCase())) return true;
  }
  return false;
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
      maxInfants: cfg.maxInfants == null ? 0 : cfg.maxInfants,
      maxDogs: cfg.maxDogs == null ? 0 : cfg.maxDogs,
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
    const pol = cancellationPolicy();
    return json({
      configured: stripeConfigured(),
      properties: publicConfig(),
      policy: { tier: pol.tier, summary: pol.summary, bullets: pol.bullets },
    });
  }

  if (action === 'quote') {
    const q = quoteStay(body);
    if (q.error) return json({ error: q.error }, 400);
    const override = ownerOverride(body);
    let available = true;
    if (!override) {
      try {
        available = await isAvailable(q.quote.property, q.quote.start, q.quote.end);
      } catch {
        /* if the check fails, don't block the quote; checkout re-checks */
      }
    }
    return json({ ok: true, quote: q.quote, available, override });
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
    // Only the server-validated override flag is passed on — never the raw code.
    const r = await createCheckout({ ...body, bypassAvailability: ownerOverride(body) }, origin);
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
