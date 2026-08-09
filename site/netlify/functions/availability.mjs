// Netlify Function (v2) — Availability from an Airbnb iCal feed.
//
//   GET /api/availability?property=the-rockery
//     → 200 { configured:true, property, unavailable:[{from,to}], updatedAt }
//     → 200 { configured:false }              when no iCal URL is set yet
//
// The iCal URLs are private (they contain a token), so they live in
// environment variables — never in the page source or the repo:
//   AIRBNB_ICAL_THE_ROCKERY
//   AIRBNB_ICAL_PRIMROSE_COTTAGE
//
// `to` is the check-out date and is EXCLUSIVE (the morning of `to` is free).
// The response is cached at the CDN for an hour so we don't hammer Airbnb.

const ICAL_ENV = {
  'the-rockery': 'AIRBNB_ICAL_THE_ROCKERY',
  'primrose-cottage': 'AIRBNB_ICAL_PRIMROSE_COTTAGE',
};

// Never cache fallbacks/errors — only successful availability data (below).
const NO_CACHE = { 'Cache-Control': 'no-store' };
const EDGE_CACHE = {
  'Cache-Control': 'public, max-age=300',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
};

function json(body, status = 200, cacheHeaders = NO_CACHE) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cacheHeaders },
  });
}

// Turn "20260409" (or "20260409T110000Z") into "2026-04-09".
function toISO(value) {
  const m = String(value).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Minimal RFC-5545 parse: unfold, then pull DTSTART/DTEND from each VEVENT.
export function parseICal(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const ranges = [];
  let inEvent = false;
  let start = null;
  let end = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      start = end = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (start) {
        const from = toISO(start);
        // DTEND is exclusive; if missing, assume a single night.
        let to = end ? toISO(end) : null;
        if (!to && from) {
          const d = new Date(from + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          to = d.toISOString().slice(0, 10);
        }
        if (from && to) ranges.push({ from, to });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'DTSTART') start = value;
    else if (name === 'DTEND') end = value;
  }

  ranges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return ranges;
}

export default async (req) => {
  const url = new URL(req.url);
  const property = (url.searchParams.get('property') || '').toLowerCase();
  const envName = ICAL_ENV[property];

  if (!envName) {
    return json({ error: 'Unknown property.' }, 400);
  }

  const icalUrl = Netlify.env.get(envName);
  if (!icalUrl) {
    // Not set up yet — the widget shows a graceful "enquire" fallback.
    return json({ configured: false, property });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(icalUrl, {
      headers: { 'User-Agent': 'LakeDistrictEscapes/1.0 (+https://lakedistrictescapes.uk)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const text = await res.text();
    const unavailable = parseICal(text);
    return json(
      {
        configured: true,
        property,
        unavailable,
        updatedAt: new Date().toISOString(),
      },
      200,
      EDGE_CACHE
    );
  } catch (err) {
    return json({ error: 'Could not load availability right now.', configured: true }, 502);
  }
};

export const config = {
  path: '/api/availability',
};
