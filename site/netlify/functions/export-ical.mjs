import { PROPERTIES, BOOKINGS as SEED_BOOKINGS } from '../management-data.mjs';
import { loadDirectBookings, ACTIVE_STATUSES } from '../direct-bookings.mjs';
import { loadOwnerBookings } from '../owner-bookings.mjs';
import { loadStatusOverrides, applyOverrides, isFreed } from '../booking-status.mjs';
import { loadOwnerBlocks } from '../owner-blocks.mjs';

// Netlify Function (v2) — PUBLIC iCal export of our booked dates, so Airbnb (or
// any other channel) can IMPORT it and block those nights on the listing.
//
//   GET /api/calendar/primrose-cottage.ics        → text/calendar (for Airbnb)
//   GET /api/calendar/the-rockery.ics
//   GET /api/calendar/primrose-cottage.ics?for=<channel>   (another channel)
//   GET /api/calendar/primrose-cottage.ics?include=all     (every held night)
//
// This is the outbound half of calendar sync: direct bookings and owner-entered
// bookings live only on our side, so Airbnb doesn't know about them until it
// pulls this feed. Airbnb host UI: Listing → Availability → Connect calendars →
// Import calendar → paste this URL. Airbnb refreshes it periodically.
//
// WE DO NOT ECHO A CHANNEL'S OWN BOOKINGS BACK TO IT.
// Airbnb already knows about every Airbnb reservation. Sending those nights
// back as an imported "Not available" block adds nothing — and it breaks every
// cancellation: when the guest cancels, Airbnb frees its own reservation, then
// re-reads this feed, finds our block still sitting on those nights and shows
// the dates as unavailable. The nights can never be re-sold on Airbnb until
// someone notices and clears our row by hand. So the feed carries only what the
// destination channel cannot already know: direct bookings, owner-entered
// blocks, and stays from OTHER channels. `?include=all` overrides this for
// debugging or for a channel that genuinely needs the full picture.
//
// Cancelled and moved bookings never go out — they have freed their nights.
//
// Dates ONLY — every event is a plain "Not available" all-day block, with no
// guest names, money, or contact details (same privacy stance as the schedule).

// The channel each feed is built for. These URLs are the ones pasted into
// Airbnb, so Airbnb-sourced stays are the ones we must not echo.
const DEFAULT_FEED_CHANNEL = 'Airbnb';

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
function sameChannel(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
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

  const includeAll = url.searchParams.get('include') === 'all';
  const feedChannel = (url.searchParams.get('for') || DEFAULT_FEED_CHANNEL).trim();
  // A booking belongs in this feed unless the destination channel can already
  // see it — i.e. it came from that channel in the first place. We only trust
  // that when the row carries the channel's own confirmation code (every seed,
  // Airtable and CSV-imported row does). A hand-typed row with no code might be
  // a block the channel knows nothing about, so it still goes out: over-blocking
  // costs a night, double-booking costs a guest.
  const fromThisChannel = (b) => sameChannel(b.channel || 'Airbnb', feedChannel) && !!String(b.code || '').trim();
  const forThisFeed = (b) => includeAll || !fromThisChannel(b);

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

  // Owner-marked cancellations/moves apply to the seed rows and the owner rows
  // alike, so a stay freed on the dashboard stops blocking the channel at once.
  const overrides = await loadStatusOverrides();

  for (const b of applyOverrides(SEED_BOOKINGS, overrides)) {
    if (b.property !== key || isFreed(b) || !forThisFeed(b)) continue;
    push(b.start, b.end, b.code || b.id);
  }
  for (const b of applyOverrides(await loadOwnerBookings(), overrides)) {
    if (b.property !== key || isFreed(b) || !forThisFeed(b)) continue;
    push(b.start, b.end, b.id || b.code);
  }
  for (const b of await loadDirectBookings()) {
    if (b.property === key && ACTIVE_STATUSES.has(b.status)) push(b.start, b.end, b.id || b.ref);
  }
  // Owner blocks — family, maintenance, a weekend off. These exist nowhere but
  // here, so every channel needs them regardless of which feed this is.
  for (const b of await loadOwnerBlocks()) {
    if (b.property === key) push(b.start, b.end, b.id);
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
