// Owner-entered bookings (added by hand on the dashboard, or imported from an
// Airbnb CSV) live in the `mgmt-bookings` Netlify Blobs store under `list`.
// Four functions read them, so the loader lives here rather than being copied
// into each one.
import { getStore } from '@netlify/blobs';

export const OWNER_BOOKINGS_STORE = 'mgmt-bookings';
export const OWNER_BOOKINGS_KEY = 'list';

export function ownerBookingsStore() {
  return getStore({ name: OWNER_BOOKINGS_STORE, consistency: 'strong' });
}

export async function loadOwnerBookings() {
  try {
    const list = await ownerBookingsStore().get(OWNER_BOOKINGS_KEY, { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveOwnerBookings(list) {
  await ownerBookingsStore().setJSON(OWNER_BOOKINGS_KEY, list);
}
