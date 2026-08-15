// ─────────────────────────────────────────────────────────────────────────
// MANAGEMENT DATA — bookings & expenses for the private owner dashboard
// (management.lakedistrictescapes.uk).
//
// Served ONLY by the gated `management` Netlify Function after a valid
// MANAGEMENT_ACCESS_CODE, so none of this appears in any public page source.
//
// HOW TO ADD DATA:
//   • Bookings: one row per reservation. `property` is 'primrose-cottage' or
//     'the-rockery'. Dates are ISO (YYYY-MM-DD). `gross` is the total rental
//     earned, `fee` the channel/service fee, `net` the payout received.
//   • Expenses: one row per purchase. `property` is a property key, or
//     'shared' for costs spread across both (apportioned 50/50 in the
//     per-property views, counted in full in the combined view).
//   • `vat` is the reclaimable VAT within `amount` (0 if none / not registered).
//   • `businessPct` (optional, default 100) is the % of the full `amount` that
//     relates to the holiday let — for a shared bill like electricity, put the
//     whole bill in `amount` and the let's share here (e.g. 40). Only that
//     fraction of the amount (and its VAT) is counted as a claimable cost.
//
// Bookings and receipts added through the dashboard are stored separately in
// Netlify Blobs (not here) and merged into the same feed at request time, so
// day-to-day entries don't need a code change or Airtable. The rows below are
// the starting/seed data; edit them only for corrections to the originals.
// ─────────────────────────────────────────────────────────────────────────

export const PROPERTIES = {
  'the-rockery': { name: 'The Rockery', short: 'House', liveFrom: null },
  'primrose-cottage': { name: 'Primrose Cottage', short: 'Cottage', liveFrom: '2026-08-01' },
};

export const BOOKINGS = [
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMS2EDZYPF', guest: 'Jonathan Guite', booked: '2026-08-07', start: '2026-08-14', end: '2026-08-16', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-08-16', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMEZCQZXZD', guest: 'Michelle Barrow', booked: '2026-08-10', start: '2026-08-21', end: '2026-08-23', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-08-23', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMRYBQZZX9', guest: 'Carly Henshaw', booked: '2026-08-08', start: '2026-08-27', end: '2026-08-31', nights: 4, gross: 500.0, fee: 77.5, cleaning: 0, net: 422.5, payout: '2026-08-31', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMBQJ3W8Z9', guest: 'Helen Schofield', booked: '2026-08-10', start: '2026-09-08', end: '2026-09-11', nights: 3, gross: 376.0, fee: 58.28, cleaning: 0, net: 317.72, payout: '2026-09-11', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMYF5DMYWQ', guest: "Mary O'Hagan", booked: '2026-08-09', start: '2026-09-11', end: '2026-09-13', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-09-13', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HM3M99ERHT', guest: 'Liz Beverley', booked: '2026-08-08', start: '2026-09-25', end: '2026-09-27', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-09-27', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMTQT2FRBA', guest: 'Sarah Goodacre', booked: '2026-08-10', start: '2026-12-26', end: '2027-01-02', nights: 7, gross: 770.35, fee: 147.88, cleaning: 0, net: 647.12, payout: '2027-01-02', currency: 'GBP' },
];

export const EXPENSES = [
  {
    property: 'primrose-cottage',
    date: '2026-08-09',
    vendor: 'Lidl, Carlisle',
    category: 'Welcome Pack & Supplies',
    note: 'Groceries & consumables (Warwick Road)',
    amount: 212.37,
    vat: 23.14,
    method: 'Card',
  },
];
