import { PROPERTIES, BOOKINGS as SEED_BOOKINGS, EXPENSES as SEED_EXPENSES } from '../management-data.mjs';

// Netlify Function (v2) — gated data feed for the private owner dashboard.
//
//   POST /api/management   body: { code }
//     → 200 { properties, bookings, expenses, meta }
//     → 401 { error }   when the code doesn't match
//
// Data source: if AIRTABLE_TOKEN + AIRTABLE_BASE_ID are configured, bookings &
// expenses are pulled live from Airtable; otherwise the built-in seed data in
// management-data.mjs is used. Everything is gated behind MANAGEMENT_ACCESS_CODE
// (separate from the guest guide) so nothing appears in any public source.

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
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

// --- Airtable helpers ---------------------------------------------------------
const PROP_KEY = {
  'the rockery': 'the-rockery',
  rockery: 'the-rockery',
  house: 'the-rockery',
  'primrose cottage': 'primrose-cottage',
  primrose: 'primrose-cottage',
  cottage: 'primrose-cottage',
  shared: 'shared',
  both: 'shared',
};
function propKey(v) {
  if (!v) return 'shared';
  const t = String(v).trim().toLowerCase();
  return PROP_KEY[t] || t.replace(/\s+/g, '-');
}
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}
function isoDate(v) {
  return v ? String(v).slice(0, 10) : '';
}
function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}
function pick(f, names, dflt) {
  for (const n of names) if (f[n] !== undefined && f[n] !== null && f[n] !== '') return f[n];
  return dflt;
}

async function airtableAll(baseId, table, token) {
  const records = [];
  let offset;
  let guard = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable "${table}" responded ${res.status}`);
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset && ++guard < 50);
  return records;
}

function mapBooking(f) {
  const start = isoDate(pick(f, ['Start', 'Check-in', 'start']));
  const end = isoDate(pick(f, ['End', 'Check-out', 'end']));
  const nightsRaw = pick(f, ['Nights', 'nights']);
  return {
    property: propKey(pick(f, ['Property', 'Listing'])),
    channel: pick(f, ['Channel'], 'Airbnb'),
    code: pick(f, ['Code', 'Confirmation Code'], ''),
    guest: pick(f, ['Guest'], ''),
    booked: isoDate(pick(f, ['Booked', 'Booking date'])),
    start,
    end,
    nights: nightsRaw !== undefined && nightsRaw !== '' ? num(nightsRaw) : nightsBetween(start, end),
    gross: num(pick(f, ['Gross', 'Gross earnings'])),
    fee: num(pick(f, ['Fee', 'Service fee'])),
    cleaning: num(pick(f, ['Cleaning', 'Cleaning fee'])),
    net: num(pick(f, ['Net', 'Amount'])),
    payout: isoDate(pick(f, ['Payout'])),
    currency: pick(f, ['Currency'], 'GBP'),
  };
}
function mapExpense(f) {
  return {
    property: propKey(pick(f, ['Property'])),
    date: isoDate(pick(f, ['Date'])),
    vendor: pick(f, ['Vendor'], ''),
    category: pick(f, ['Category'], 'Uncategorised'),
    note: pick(f, ['Note', 'Notes'], ''),
    amount: num(pick(f, ['Amount'])),
    vat: num(pick(f, ['VAT'])),
    method: pick(f, ['Method'], ''),
  };
}

// -----------------------------------------------------------------------------
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

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
  if (!code) return json({ error: 'Please enter your access code.' }, 400);
  if (!safeEqual(code.toLowerCase(), expected.trim().toLowerCase())) {
    return json({ error: 'That access code isn’t right.' }, 401);
  }

  const token = Netlify.env.get('AIRTABLE_TOKEN');
  const baseId = Netlify.env.get('AIRTABLE_BASE_ID');
  const bTable = Netlify.env.get('AIRTABLE_BOOKINGS_TABLE') || 'Bookings';
  const eTable = Netlify.env.get('AIRTABLE_EXPENSES_TABLE') || 'Expenses';

  let bookings = SEED_BOOKINGS;
  let expenses = SEED_EXPENSES;
  let source = 'seed';
  let warning = null;

  if (token && baseId) {
    try {
      const [brecs, erecs] = await Promise.all([
        airtableAll(baseId, bTable, token),
        airtableAll(baseId, eTable, token),
      ]);
      bookings = brecs.map((r) => mapBooking(r.fields || {})).filter((b) => b.start && b.end);
      expenses = erecs.map((r) => mapExpense(r.fields || {})).filter((e) => e.date && e.amount);
      source = 'airtable';
    } catch (err) {
      source = 'seed';
      warning = 'Could not reach Airtable — showing built-in data. (' + err.message + ')';
    }
  }

  return json({ properties: PROPERTIES, bookings, expenses, meta: { source, warning } });
};

export const config = {
  path: '/api/management',
};
