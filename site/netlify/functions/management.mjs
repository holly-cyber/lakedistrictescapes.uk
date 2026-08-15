import { getStore } from '@netlify/blobs';
import { PROPERTIES, BOOKINGS as SEED_BOOKINGS, EXPENSES as SEED_EXPENSES } from '../management-data.mjs';

// Netlify Function (v2) — gated data feed + write API for the private owner
// dashboard (management.lakedistrictescapes.uk).
//
//   POST /api/management   body: { code, action?, ... }
//     action 'data' (default) → { properties, bookings, expenses, meta }
//     action 'addExpense'     → { ok, expense }      records a new receipt
//     action 'deleteExpense'  → { ok, id }           removes an owner receipt
//     action 'receipt'        → { ok, data, type, name }   fetch a receipt file
//     → 401 { error }   when the code doesn't match
//
// Data sources:
//   • Bookings + baseline expenses: Airtable if AIRTABLE_TOKEN + AIRTABLE_BASE_ID
//     are configured, otherwise the built-in seed data in management-data.mjs.
//   • Owner-entered receipts/expenses (added through the dashboard) live in
//     Netlify Blobs — the metadata as a JSON list, the receipt image/PDF as a
//     binary blob. They are merged into the expenses feed for every view.
// Everything is gated behind MANAGEMENT_ACCESS_CODE so nothing appears in any
// public source.

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

// --- field helpers ------------------------------------------------------------
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
  const k = PROP_KEY[t] || t.replace(/\s+/g, '-');
  return k === 'the-rockery' || k === 'primrose-cottage' ? k : 'shared';
}
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}
function clampPct(v) {
  let n = num(v);
  if (!isFinite(n)) n = 100;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
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

// --- Airtable helpers ---------------------------------------------------------
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
  const pctRaw = pick(f, ['Business %', 'Business Use %', 'Business use %', 'Holiday let %', 'Let %', 'Pct']);
  return {
    property: propKey(pick(f, ['Property'])),
    date: isoDate(pick(f, ['Date'])),
    vendor: pick(f, ['Vendor'], ''),
    category: pick(f, ['Category'], 'Uncategorised'),
    note: pick(f, ['Note', 'Notes'], ''),
    amount: num(pick(f, ['Amount', 'Total'])),
    businessPct: pctRaw !== undefined && pctRaw !== '' ? clampPct(pctRaw) : 100,
    vat: num(pick(f, ['VAT'])),
    method: pick(f, ['Method'], ''),
    source: 'airtable',
  };
}

// --- owner receipts store (Netlify Blobs) ------------------------------------
const EXP_STORE = 'mgmt-expenses';
const RCPT_STORE = 'mgmt-receipts';
const RCPT_MAX_BYTES = Math.round(4.5 * 1024 * 1024); // ~4.5MB decoded

function expStore() {
  return getStore({ name: EXP_STORE, consistency: 'strong' });
}
function rcptStore() {
  return getStore({ name: RCPT_STORE, consistency: 'strong' });
}
async function loadOwnerExpenses() {
  try {
    const list = await expStore().get('list', { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
async function saveOwnerExpenses(list) {
  await expStore().setJSON('list', list);
}
// Trim an owner record down to the fields the dashboard needs.
function ownerPublic(x) {
  return {
    id: x.id,
    property: x.property,
    date: x.date,
    vendor: x.vendor,
    category: x.category,
    note: x.note,
    amount: x.amount,
    businessPct: x.businessPct == null ? 100 : x.businessPct,
    vat: x.vat || 0,
    method: x.method || '',
    source: 'owner',
    receiptId: x.receiptId || null,
    receiptName: x.receiptName || null,
    receiptType: x.receiptType || null,
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

  const action = String(body?.action || 'data');

  // ---- WRITE: add a receipt / expense ----
  if (action === 'addExpense') {
    const amount = num(body.amount);
    const date = isoDate(body.date);
    if (!(amount > 0)) return json({ error: 'Please enter an amount greater than £0.' }, 400);
    if (!date) return json({ error: 'Please choose a date for the receipt.' }, 400);

    const id = crypto.randomUUID();
    let receipt = {};
    const r = body.receipt;
    if (r && typeof r.data === 'string' && r.data.length) {
      let buf;
      try {
        buf = Buffer.from(r.data, 'base64');
      } catch {
        return json({ error: 'The receipt file could not be read.' }, 400);
      }
      if (!buf.length) return json({ error: 'The receipt file appears to be empty.' }, 400);
      if (buf.length > RCPT_MAX_BYTES) {
        return json({ error: 'That receipt is too large — please use a file under 4MB.' }, 400);
      }
      try {
        await rcptStore().set(`receipt/${id}`, buf, {
          metadata: {
            contentType: String(r.type || 'application/octet-stream'),
            name: String(r.name || 'receipt'),
          },
        });
        receipt = {
          receiptId: id,
          receiptName: String(r.name || 'receipt').slice(0, 200),
          receiptType: String(r.type || 'application/octet-stream'),
        };
      } catch (err) {
        return json({ error: 'Could not save the receipt file. ' + err.message }, 500);
      }
    }

    const expense = {
      id,
      property: propKey(body.property),
      date,
      vendor: String(body.vendor || '').trim().slice(0, 200),
      category: String(body.category || '').trim().slice(0, 120) || 'Uncategorised',
      note: String(body.note || '').trim().slice(0, 500),
      amount,
      businessPct: clampPct(body.businessPct == null ? 100 : body.businessPct),
      vat: num(body.vat),
      method: String(body.method || '').trim().slice(0, 60),
      source: 'owner',
      createdAt: new Date().toISOString(),
      ...receipt,
    };

    try {
      const list = await loadOwnerExpenses();
      list.push(expense);
      await saveOwnerExpenses(list);
    } catch (err) {
      return json({ error: 'Could not save the expense. ' + err.message }, 500);
    }
    return json({ ok: true, expense: ownerPublic(expense) });
  }

  // ---- WRITE: delete an owner receipt / expense ----
  if (action === 'deleteExpense') {
    const id = String(body.id || '');
    if (!id) return json({ error: 'Missing id.' }, 400);
    try {
      const list = await loadOwnerExpenses();
      const found = list.find((x) => x.id === id);
      if (!found) return json({ error: 'That expense was not found.' }, 404);
      await saveOwnerExpenses(list.filter((x) => x.id !== id));
      if (found.receiptId) {
        try {
          await rcptStore().delete(`receipt/${found.receiptId}`);
        } catch {
          /* file may already be gone */
        }
      }
    } catch (err) {
      return json({ error: 'Could not delete the expense. ' + err.message }, 500);
    }
    return json({ ok: true, id });
  }

  // ---- READ: a single receipt file (base64) ----
  if (action === 'receipt') {
    const id = String(body.id || '');
    if (!id) return json({ error: 'Missing id.' }, 400);
    try {
      const blob = await rcptStore().getWithMetadata(`receipt/${id}`, { type: 'arrayBuffer' });
      if (!blob || !blob.data) return json({ error: 'Receipt not found.' }, 404);
      return json({
        ok: true,
        data: Buffer.from(blob.data).toString('base64'),
        type: (blob.metadata && blob.metadata.contentType) || 'application/octet-stream',
        name: (blob.metadata && blob.metadata.name) || 'receipt',
      });
    } catch (err) {
      return json({ error: 'Could not load the receipt. ' + err.message }, 500);
    }
  }

  // ---- READ: dashboard data ----
  const token = Netlify.env.get('AIRTABLE_TOKEN');
  const baseId = Netlify.env.get('AIRTABLE_BASE_ID');
  const bTable = Netlify.env.get('AIRTABLE_BOOKINGS_TABLE') || 'Bookings';
  const eTable = Netlify.env.get('AIRTABLE_EXPENSES_TABLE') || 'Expenses';

  let bookings = SEED_BOOKINGS;
  let baseExpenses = SEED_EXPENSES.map((x) => ({
    ...x,
    businessPct: x.businessPct == null ? 100 : x.businessPct,
    source: 'seed',
  }));
  let source = 'seed';
  let warning = null;

  if (token && baseId) {
    try {
      const [brecs, erecs] = await Promise.all([
        airtableAll(baseId, bTable, token),
        airtableAll(baseId, eTable, token),
      ]);
      bookings = brecs.map((r) => mapBooking(r.fields || {})).filter((b) => b.start && b.end);
      baseExpenses = erecs.map((r) => mapExpense(r.fields || {})).filter((e) => e.date && e.amount);
      source = 'airtable';
    } catch (err) {
      source = 'seed';
      warning = 'Could not reach Airtable — showing built-in data. (' + err.message + ')';
    }
  }

  const owner = (await loadOwnerExpenses()).map(ownerPublic);
  const expenses = [...baseExpenses, ...owner];

  return json({
    properties: PROPERTIES,
    bookings,
    expenses,
    meta: { source, warning, ownerCount: owner.length },
  });
};

export const config = {
  path: '/api/management',
};
