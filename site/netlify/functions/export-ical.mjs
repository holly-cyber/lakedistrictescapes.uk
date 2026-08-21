import { getStore } from '@netlify/blobs';
import { PROPERTIES, BOOKINGS as SEED_BOOKINGS } from '../management-data.mjs';
import { loadDirectBookings, ACTIVE_STATUSES } from '../direct-bookings.mjs';

// Netlify Function (v2) — PUBLIC iCal export of our booked dates, so Airbnb (or
// any other channel) can IMPORT it and block those nights on the listing.
//
//   GET /api/calendar/primrose-cottage.ics   → text/calendar
//   GET /api/calendar/the-rockery.ics
//
// This is the outbound half of calendar sync: direct bookings + owner-entered
// bookings live only on our side, so Airbnb doesn't know about them until it
// pulls this feed. Airbnb host UI: Listing → Availability → Connect calendars →
// Import calendar → paste this URL. Airbnb refreshes it periodically.
//
// Dates ONLY — every event is a plain "Not available" all-day block, with no
// guest names, money, or contact details (same privacy stance as the schedule).

const ICAL_ENV = {
  'the-rockery': 'AIRBNB_ICAL_THE_ROCKERY',
  'primrose-cottage': 'AIRBNB_ICAL_PRIMROSE_COTTAGE',
};

function isoDate(v) {
  return v ? String(v).slice(0, 10) : '';
}
// "2027-05-10" → "20270510" for DATE-valued properties.
function icalDate(iso) {
  return isoDate(iso).replace(/-/g, '');
}
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}
function fold(line) {
  // RFC 5545: fold lines longer than 75 octets.
  if (line.length <= 73) return line;
  const parts = [];
  let s = line;
  parts.push(s.slice(0, 73));
  s = s.slice(73);
  while (s.length > 72) {
    parts.push(' ' + s.slice(0, 72));
    s = s.slice(72);
  }
  parts.push(' ' + s);
  return parts.join('\r\n');
}

async function loadOwnerBookings() {
  try {
    const list = await getStore({ name: 'mgmt-bookings', consistency: 'strong' }).get('list', { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default async (req) => {
  // property from the path (…/calendar/<property>.ics) or a ?property= query.
  const url = new URL(req.url);
  let key = url.searchParams.get('property') || '';
  if (!key) {
    const last = url.pathname.split('/').pop() || '';
    key = last.replace(/\.ics$/i, '');
  }
  key = key.toLowerCase();
  if (!PROPERTIES[key]) {
    return new Response('Unknown property.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  // Gather every date range we consider booked for this property so Airbnb never
  // under-blocks: seed + owner (manual/CSV) + confirmed direct (Stripe) bookings.
  // Re-exporting an Airbnb-sourced date is harmless — Airbnb simply keeps that
  // night blocked — while the direct/manual ones are the dates Airbnb wouldn't
  // otherwise know about. Deduped by date range.
  const seen = new Set();
  const events = [];
  const push = (start, end, uid) => {
    const s = isoDate(start);
    const e = isoDate(end);
    if (!s || !e || e <= s) return;
    const dedupe = s + '|' + e;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    events.push({ start: s, end: e, uid: (uid || dedupe).replace(/[^A-Za-z0-9._-]/g, '') });
  };

  for (const b of SEED_BOOKINGS) {
    if (b.property === key) push(b.start, b.end, b.code || b.id);
  }
  for (const b of await loadOwnerBookings()) {
    if (b.property === key) push(b.start, b.end, b.id || b.code);
  }
  for (const b of await loadDirectBookings()) {
    if (b.property === key && ACTIVE_STATUSES.has(b.status)) push(b.start, b.end, b.id || b.ref);
  }

  const dtstamp = stamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lake District Escapes//Direct Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold('X-WR-CALNAME:' + PROPERTIES[key].name + ' — Lake District Escapes (direct)'),
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      fold('UID:' + ev.uid + '@lakedistrictescapes.uk'),
      'DTSTAMP:' + dtstamp,
      'DTSTART;VALUE=DATE:' + icalDate(ev.start),
      'DTEND;VALUE=DATE:' + icalDate(ev.end),
      'SUMMARY:Not available',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${key}.ics"`,
      // Short cache — Airbnb polls periodically; keep it reasonably fresh.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
};

export const config = {
  path: '/api/calendar/:file',
};
