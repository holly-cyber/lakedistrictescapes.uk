import { PROPERTIES, BOOKINGS, EXPENSES } from '../management-data.mjs';

// Netlify Function (v2) — gated data feed for the private owner dashboard at
// management.lakedistrictescapes.uk.
//
//   POST /api/management   body: { code }
//     → 200 { properties, bookings, expenses }   when the code matches
//     → 401 { error }                             when it doesn't
//
// Financial data lives server-side and is only returned once the management
// access code validates, so it never appears in any public page source. This
// uses its OWN code (MANAGEMENT_ACCESS_CODE), separate from the guest guide.

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const expected = Netlify.env.get('MANAGEMENT_ACCESS_CODE');
  if (!expected) {
    return json({ error: 'The dashboard isn’t available yet — set MANAGEMENT_ACCESS_CODE.' }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const code = String(body?.code ?? '').trim();
  if (!code) {
    return json({ error: 'Please enter your access code.' }, 400);
  }

  if (!safeEqual(code.toLowerCase(), expected.trim().toLowerCase())) {
    return json({ error: 'That access code isn’t right.' }, 401);
  }

  return json({ properties: PROPERTIES, bookings: BOOKINGS, expenses: EXPENSES });
};

export const config = {
  path: '/api/management',
};
