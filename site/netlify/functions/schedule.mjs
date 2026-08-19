import { getStore } from '@netlify/blobs';
import { PROPERTIES, BOOKINGS as SEED_BOOKINGS } from '../management-data.mjs';
import { loadDirectBookings, directToSchedule, ACTIVE_STATUSES } from '../direct-bookings.mjs';

// Netlify Function (v2) — OPEN changeover schedule for the cleaner & gardener.
//
//   GET /api/schedule
//     → 200 { properties, bookings, meta, generatedAt }
//
// Returns ONLY the non-sensitive booking dates (property, check-in, check-out,
// nights, channel) — no guest names, and never any money, fees or payouts.
// The cleaner & gardener only need the changeover dates. It merges three
// sources so it stays live with each new booking:
//   1. seed bookings (management-data.mjs)
//   2. owner-added / CSV-imported bookings (Netlify Blobs, same as the dashboard)
//   3. LIVE Airbnb reservations from the iCal feeds (AIRBNB_ICAL_* env vars) —
//      so a new Airbnb booking appears automatically, without manual entry.
// No access code: opened from a plain link, but the page is noindex.

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Live-ish: a short CDN cache keeps a shared link snappy and protects Airbnb
  // from being hit on every visit, while staying near-real-time.
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

const ICAL_ENV = {
  'the-rockery': 'AIRBNB_ICAL_THE_ROCKERY',
  'primrose-cottage': 'AIRBNB_ICAL_PRIMROSE_COTTAGE',
};

function isoDate(v) {
  return v ? String(v).slice(0, 10) : '';
}
function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}
// "20260409" or "20260409T110000Z" → "2026-04-09".
function icalToIso(value) {
  const m = String(value).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function loadOwnerBookings() {
  try {
    const list = await getStore({ name: 'mgmt-bookings', consistency: 'strong' }).get('list', { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Parse only *reservation* events (skip owner-set "Not available" blocks) out of
// an Airbnb iCal feed. Returns [{ from, to }] (to = check-out date, exclusive).
export function parseIcalReservations(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let inEvent = false;
  let start = null;
  let end = null;
  let summary = '';
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; start = end = null; summary = ''; continue; }
    if (line === 'END:VEVENT') {
      if (start && /reserv/i.test(summary)) {
        const from = icalToIso(start);
        let to = end ? icalToIso(end) : null;
        if (!to && from) {
          const d = new Date(from + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          to = d.toISOString().slice(0, 10);
        }
        if (from && to) out.push({ from, to });
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
    else if (name === 'SUMMARY') summary = value;
  }
  return out;
}

async function fetchIcalReservations(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LakeDistrictEscapes/1.0 (+https://lakedistrictescapes.uk)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return parseIcalReservations(await res.text());
  } catch {
    return [];
  }
}

export default async () => {
  // 1 + 2: seed + owner bookings + confirmed direct (Stripe) bookings, mapped to
  // safe fields (dates only — no guest names, no money).
  const owner = await loadOwnerBookings();
  const direct = (await loadDirectBookings()).filter((b) => ACTIVE_STATUSES.has(b.status)).map(directToSchedule);
  const list = [...SEED_BOOKINGS, ...owner, ...direct].map((b) => {
    const start = isoDate(b.start);
    const end = isoDate(b.end);
    return {
      property: b.property === 'the-rockery' ? 'the-rockery' : 'primrose-cottage',
      start,
      end,
      nights: b.nights > 0 ? Math.round(b.nights) : nightsBetween(start, end),
      channel: String(b.channel || 'Airbnb').slice(0, 40),
    };
  });

  // 3: live Airbnb reservations from the iCal feeds, deduped against the above.
  const keys = new Set(list.map((b) => b.property + '|' + b.start + '|' + b.end));
  const feeds = [];
  for (const [propKey, envName] of Object.entries(ICAL_ENV)) {
    const url = Netlify.env.get(envName);
    if (url) feeds.push(fetchIcalReservations(url).then((rs) => ({ propKey, rs })));
  }
  const liveConfigured = feeds.length > 0;
  const feedResults = await Promise.all(feeds);
  for (const { propKey, rs } of feedResults) {
    for (const r of rs) {
      const start = isoDate(r.from);
      const end = isoDate(r.to);
      if (!start || !end) continue;
      const key = propKey + '|' + start + '|' + end;
      if (keys.has(key)) continue;
      keys.add(key);
      list.push({ property: propKey, start, end, nights: nightsBetween(start, end), channel: 'Airbnb' });
    }
  }

  // Keep only stays that haven't fully finished (from yesterday onward), sorted.
  const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const bookings = list
    .filter((b) => b.start && b.end && b.end >= cutoff)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const properties = {};
  for (const key of Object.keys(PROPERTIES)) {
    properties[key] = { name: PROPERTIES[key].name, short: PROPERTIES[key].short };
  }

  return new Response(
    JSON.stringify({ properties, bookings, meta: { live: liveConfigured }, generatedAt: new Date().toISOString() }),
    { status: 200, headers: JSON_HEADERS },
  );
};

export const config = {
  path: '/api/schedule',
};
