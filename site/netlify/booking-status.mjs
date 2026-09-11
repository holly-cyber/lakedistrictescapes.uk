// ─────────────────────────────────────────────────────────────────────────
// BOOKING STATUS OVERRIDES — "this stay is cancelled / moved, free the dates"
//
// Why this exists
// ---------------
// Cancellations arrive constantly (a guest cancels on Airbnb, a stay is moved
// to new dates). Until now the only way to free those nights again was to edit
// `management-data.mjs` and redeploy, because the seed rows and the owner rows
// in the `mgmt-bookings` blob had no editable status. Any night we still hold a
// booking row for goes out in our iCal export, so a stale row keeps the nights
// blocked on Airbnb long after the guest has gone.
//
// Overrides are stored in the `mgmt-bookings` store under the key `status`:
//
//   { "<key>": { status: 'cancelled'|'moved'|'confirmed', movedTo, note, at } }
//
// They are applied everywhere a booking list is read: the owner dashboard, the
// cleaner/gardener schedule, the direct-booking availability check and the iCal
// export. 'confirmed' is an explicit un-cancel (it also overrides a status that
// came from the seed data).
// ─────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs';

export const STATUS_STORE = 'mgmt-bookings';
export const STATUS_KEY = 'status';
// Statuses that free the dates: the booking stays on record but stops blocking.
export const FREED_STATUSES = new Set(['cancelled', 'moved']);
export const VALID_STATUSES = new Set(['cancelled', 'moved', 'confirmed']);

function iso(v) {
  return v ? String(v).slice(0, 10) : '';
}

// A stable identity for a booking across reloads of the seed data. Dates are
// part of the key on purpose: a "moved" reservation keeps its confirmation code
// on both the original and the new row, so the code alone would cancel both.
export function bookingKey(b) {
  if (!b) return '';
  return [
    b.property || '',
    iso(b.start),
    iso(b.end),
    String(b.code || '').trim().toUpperCase(),
  ].join('|');
}

// An owner-entered row also carries a UUID, which survives an edit to its
// dates. Match on either.
function keysFor(b) {
  const keys = [bookingKey(b)];
  if (b && b.id) keys.push('id:' + b.id);
  return keys;
}

function store() {
  return getStore({ name: STATUS_STORE, consistency: 'strong' });
}

export async function loadStatusOverrides() {
  try {
    const map = await store().get(STATUS_KEY, { type: 'json' });
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

export async function saveStatusOverrides(map) {
  await store().setJSON(STATUS_KEY, map || {});
}

// Look up the override that applies to a booking, if any.
export function overrideFor(b, overrides) {
  if (!overrides) return null;
  for (const k of keysFor(b)) {
    if (overrides[k]) return overrides[k];
  }
  return null;
}

// Return `b` with any override applied. 'confirmed' clears a cancelled/moved
// status that came from the seed data.
export function applyOverride(b, overrides) {
  const o = overrideFor(b, overrides);
  if (!o || !VALID_STATUSES.has(o.status)) return b;
  if (o.status === 'confirmed') {
    const { status, movedTo, movedOn, cancelledOn, ...rest } = b;
    return { ...rest, statusNote: o.note || '' };
  }
  return {
    ...b,
    status: o.status,
    movedTo: o.status === 'moved' ? iso(o.movedTo) || iso(b.movedTo) : undefined,
    cancelledOn: o.status === 'cancelled' ? iso(o.at) || iso(b.cancelledOn) : b.cancelledOn,
    movedOn: o.status === 'moved' ? iso(o.at) || iso(b.movedOn) : b.movedOn,
    statusNote: o.note || '',
  };
}

export function applyOverrides(list, overrides) {
  if (!Array.isArray(list)) return [];
  if (!overrides || !Object.keys(overrides).length) return list;
  return list.map((b) => applyOverride(b, overrides));
}

// Cancelled/moved bookings are kept for the record but free their nights.
export function isFreed(b) {
  return !!b && FREED_STATUSES.has(b.status);
}
