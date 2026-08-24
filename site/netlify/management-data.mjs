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

// ─────────────────────────────────────────────────────────────────────────
// DIRECT-BOOKING PRICING (Stripe). Powers the public /book page and the
// deposit → balance flow: a 30% deposit is taken at booking and the card is
// saved; the remaining balance is auto-charged `balanceDueDays` before arrival.
//
//   • nightly       — £ per night (flat rate for now; edit to change price)
//   • cleaningFee    — £ added once per stay (0 = none)
//   • minNights      — shortest bookable stay
//   • maxGuests      — capacity used to validate the guest count
//   • depositPct     — % taken up front (rest auto-charged before arrival)
//   • balanceDueDays — how many days before check-in the balance is charged
//   • bookable       — false hides the property from /book (e.g. not open yet)
//
// TODO (owner): confirm the real nightly rates below before going live —
// these are starting figures (Primrose ≈ its recent Airbnb average; The
// Rockery is a placeholder while it stays "Coming Soon 2027", bookable:false).
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// CANCELLATION POLICY for direct bookings — mirrors Airbnb's "Flexible" tier
// so guests get the same terms they'd see on the listing.
//   • Cancel 24h+ before check-in → full refund of everything paid.
//   • Cancel within 24h of check-in (or after arrival) → the first night (and
//     any nights already begun) is non-refundable; remaining nights refunded.
// Cancelling also stops the automatic balance charge. Check-in time is treated
// as 15:00 (3pm). To switch tiers later, change fullRefundHours / the text.
// ─────────────────────────────────────────────────────────────────────────
export const CANCELLATION_POLICY = {
  tier: 'Flexible',
  fullRefundHours: 24,
  checkinHour: 15,
  summary:
    'Free cancellation up to 24 hours before check-in for a full refund. Cancel within 24 hours of check-in and the first night is non-refundable, with any remaining nights refunded.',
  bullets: [
    'Full refund if you cancel at least 24 hours before check-in (3pm arrival).',
    'Within 24 hours of check-in: first night non-refundable, remaining nights refunded.',
  ],
};

export const PRICING = {
  'primrose-cottage': {
    bookable: true,
    nightly: 115,
    cleaningFee: 0,
    minNights: 2,
    maxGuests: 2, // adults / over-2s
    maxInfants: 1, // children under 2 (don't count toward the sleeps total)
    maxDogs: 2,
    depositPct: 30,
    balanceDueDays: 7,
    currency: 'GBP',
  },
  'the-rockery': {
    bookable: false, // Coming Soon 2027 — set true (and confirm nightly) to open
    nightly: 495,
    cleaningFee: 0,
    minNights: 3,
    maxGuests: 9,
    maxInfants: 2,
    maxDogs: 3,
    depositPct: 30,
    balanceDueDays: 7,
    currency: 'GBP',
  },
};

export const BOOKINGS = [
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMS2EDZYPF', guest: 'Jonathan Guite', booked: '2026-08-07', start: '2026-08-14', end: '2026-08-16', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-08-16', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMBBMB49FW', guest: 'Chloe Hayes', booked: '2026-08-16', start: '2026-08-16', end: '2026-08-18', nights: 2, gross: 242.25, fee: 46.5, cleaning: 0, net: 203.5, payout: '2026-08-18', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HM9ZSDWKYF', guest: 'Gill Dando', booked: '2026-08-18', start: '2026-08-18', end: '2026-08-21', nights: 3, gross: 363.37, fee: 69.76, cleaning: 0, net: 305.24, payout: '2026-08-21', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMEZCQZXZD', guest: 'Michelle Barrow', booked: '2026-08-10', start: '2026-08-21', end: '2026-08-23', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-08-23', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMRYBQZZX9', guest: 'Carly Henshaw', booked: '2026-08-08', start: '2026-08-27', end: '2026-08-31', nights: 4, gross: 500.0, fee: 77.5, cleaning: 0, net: 422.5, payout: '2026-08-31', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMBQJ3W8Z9', guest: 'Helen Schofield', booked: '2026-08-10', start: '2026-09-08', end: '2026-09-11', nights: 3, gross: 376.0, fee: 58.28, cleaning: 0, net: 317.72, payout: '2026-09-11', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HMYF5DMYWQ', guest: "Mary O'Hagan", booked: '2026-08-09', start: '2026-09-11', end: '2026-09-13', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-09-13', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HM3M99ERHT', guest: 'Liz Beverley', booked: '2026-08-08', start: '2026-09-25', end: '2026-09-27', nights: 2, gross: 250.0, fee: 38.75, cleaning: 0, net: 211.25, payout: '2026-09-27', currency: 'GBP' },
  { property: 'primrose-cottage', channel: 'Airbnb', code: 'HM835TMCWK', guest: 'Miranda Palmer', booked: '2026-08-12', start: '2026-10-20', end: '2026-10-23', nights: 3, gross: 363.37, fee: 69.76, cleaning: 0, net: 305.24, payout: '2026-10-23', currency: 'GBP' },
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
