// ─────────────────────────────────────────────────────────────────────────
// OWNER BLOCKS — "these nights are ours"
//
// Family stays, maintenance, a weekend off. Not bookings: no guest, no money,
// nothing to import from a channel. They exist only here, which makes them the
// one thing our iCal feed genuinely has to tell Airbnb about — Airbnb has no
// other way to find out.
//
// Records live in the `mgmt-blocks` Netlify Blobs store (key `list`):
//   { id, property, start, end, reason, note, createdAt }
//
// `end` is the check-out date and is EXCLUSIVE, the same as a booking: a block
// of 24th → 26th holds the nights of the 24th and 25th.
//
// Read by: the iCal export (so channels block the nights), the direct-booking
// availability guard (so nobody books over them), the cleaner/gardener schedule
// (so they know the cottage is occupied) and the owner dashboard.
//
// They never touch income — there isn't any — but they DO come out of the
// occupancy denominator, so a week with the family doesn't read as a week you
// failed to sell.
// ─────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs';

export const BLOCKS_STORE = 'mgmt-blocks';
export const BLOCKS_KEY = 'list';

// What the nights are being held for. Free text is allowed too (trimmed and
// capped); these are just the one-tap options on the dashboard.
export const BLOCK_REASONS = ['Owner use', 'Family', 'Maintenance', 'Cleaning', 'Other'];
export const DEFAULT_BLOCK_REASON = 'Owner use';
// A block is a held gap, not a lease — guards a fat-fingered date entry.
export const MAX_BLOCK_NIGHTS = 365;

function iso(v) {
  return v ? String(v).slice(0, 10) : '';
}
function nights(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

function store() {
  return getStore({ name: BLOCKS_STORE, consistency: 'strong' });
}

export async function loadOwnerBlocks() {
  try {
    const list = await store().get(BLOCKS_KEY, { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveOwnerBlocks(list) {
  await store().setJSON(BLOCKS_KEY, list);
}

// Validate + normalise a block from the dashboard form. Returns { block } or
// { error }. `isProperty` is passed in so this module doesn't need to know the
// property list.
export function buildBlock(input, isProperty) {
  const start = iso(input && input.start);
  const end = iso(input && input.end);
  if (!start || !end) return { error: 'Please give both dates.' };
  const n = nights(start, end);
  if (n < 1) return { error: 'The end date must be after the start date.' };
  if (n > MAX_BLOCK_NIGHTS) return { error: 'That block is longer than a year — please check the dates.' };
  const property = String((input && input.property) || '').trim().toLowerCase();
  if (!isProperty(property)) return { error: 'Please choose which cottage to block.' };
  return {
    block: {
      id: crypto.randomUUID(),
      property,
      start,
      end,
      nights: n,
      reason: String((input && input.reason) || DEFAULT_BLOCK_REASON).trim().slice(0, 40) || DEFAULT_BLOCK_REASON,
      note: String((input && input.note) || '').trim().slice(0, 200),
      createdAt: new Date().toISOString(),
    },
  };
}

// Nights held by owner blocks in a given month ("2026-09"), for the occupancy
// denominator. Counts each night once even if two blocks overlap.
export function blockedNightsByMonth(blocks, propertyKeys) {
  const keys = new Set(propertyKeys);
  const seen = new Set();
  const out = {};
  for (const b of blocks || []) {
    if (!keys.has(b.property) || !b.start || !b.end) continue;
    let d = new Date(iso(b.start) + 'T00:00:00Z');
    const stop = new Date(iso(b.end) + 'T00:00:00Z');
    while (d < stop) {
      const night = d.toISOString().slice(0, 10);
      const id = b.property + '|' + night;
      if (!seen.has(id)) {
        seen.add(id);
        const month = night.slice(0, 7);
        out[month] = (out[month] || 0) + 1;
      }
      d = new Date(d.getTime() + 86400000);
    }
  }
  return out;
}
