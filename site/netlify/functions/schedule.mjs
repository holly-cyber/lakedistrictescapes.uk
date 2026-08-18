import { getStore } from '@netlify/blobs';
import { PROPERTIES, BOOKINGS as SEED_BOOKINGS } from '../management-data.mjs';

// Netlify Function (v2) — OPEN changeover schedule for the cleaner & gardener.
//
//   GET /api/schedule
//     → 200 { properties, bookings, generatedAt }
//
// Returns ONLY the non-sensitive booking dates (property, check-in, check-out,
// nights, guest FIRST name, channel) — never any money, surnames, fees or
// payouts. Merges the seed bookings with owner-added/imported bookings from
// Netlify Blobs, so it stays in step with the management dashboard. No access
// code: it's meant to be opened from a plain link, but the page is noindex.

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Live-ish: cache briefly at the CDN so a shared link stays snappy without
  // going stale for long.
  'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
};

function isoDate(v) {
  return v ? String(v).slice(0, 10) : '';
}
function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}
function firstName(v) {
  const s = String(v || '').trim();
  return s ? s.split(/\s+/)[0].slice(0, 40) : '';
}

async function loadOwnerBookings() {
  try {
    const list = await getStore({ name: 'mgmt-bookings', consistency: 'strong' }).get('list', { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default async () => {
  const owner = await loadOwnerBookings();
  const all = [...SEED_BOOKINGS, ...owner];

  // Keep only stays that haven't fully finished yet (from yesterday onward), so
  // the cleaner/gardener see what's coming, not the whole history.
  const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const bookings = all
    .map((b) => {
      const start = isoDate(b.start);
      const end = isoDate(b.end);
      return {
        property: b.property === 'the-rockery' ? 'the-rockery' : 'primrose-cottage',
        start,
        end,
        nights: b.nights > 0 ? Math.round(b.nights) : nightsBetween(start, end),
        guest: firstName(b.guest),
        channel: String(b.channel || 'Airbnb').slice(0, 40),
      };
    })
    .filter((b) => b.start && b.end && b.end >= cutoff)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  const properties = {};
  for (const key of Object.keys(PROPERTIES)) {
    properties[key] = { name: PROPERTIES[key].name, short: PROPERTIES[key].short };
  }

  return new Response(
    JSON.stringify({ properties, bookings, generatedAt: new Date().toISOString() }),
    { status: 200, headers: JSON_HEADERS },
  );
};

export const config = {
  path: '/api/schedule',
};
