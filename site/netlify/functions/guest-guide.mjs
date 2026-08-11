import { GUIDE } from '../guide-data.mjs';

// Netlify Function (v2) — Gated guest guide for Lake District Escapes.
//
//   POST /api/guest-guide   body: { code }
//     → 200 { guide }   when the code matches GUEST_ACCESS_CODE
//     → 401 { error }    when it doesn't
//
// The guide content lives server-side (guide-data.mjs) and is only returned
// once the access code validates, so Wi-Fi passwords, door codes etc. never
// appear in the public page source.

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Constant-time-ish comparison to avoid leaking length/branch timing.
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

  const expected = Netlify.env.get('GUEST_ACCESS_CODE');
  if (!expected) {
    // Fail closed if the site owner hasn't set a code yet.
    return json(
      { error: 'The guide isn’t available yet. Please contact your host.' },
      503
    );
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

  // Normalise: codes are case-insensitive and ignore surrounding spaces.
  if (!safeEqual(code.toLowerCase(), expected.trim().toLowerCase())) {
    return json({ error: 'That access code isn’t right. Please check your booking email.' }, 401);
  }

  // Only the private property manuals are returned here — the local-area and
  // walks content is public and rendered directly on the page. Hidden
  // properties (e.g. not yet bookable) are withheld entirely.
  const properties = Object.fromEntries(
    Object.entries(GUIDE.properties).filter(([, p]) => !p.hidden)
  );
  return json({ properties });
};

export const config = {
  path: '/api/guest-guide',
};
