// ─────────────────────────────────────────────────────────────────────────
// DIRECT BOOKINGS — the deposit-then-balance lifecycle, shared by:
//   • functions/book.mjs           (public: quote + start checkout)
//   • functions/stripe-webhook.mjs (Stripe → mark deposit paid / paid in full)
//   • functions/stripe-balance.mjs (scheduled: auto-charge balances due)
//   • functions/management.mjs     (owner dashboard: list + retry a balance)
//   • functions/schedule.mjs       (cleaner/gardener: hold the booked dates)
//
// Records live in the `direct-bookings` Netlify Blobs store (key `list`).
//
// Lifecycle status:
//   pending           → checkout started, deposit not yet paid (soft 30-min hold)
//   deposit_paid      → deposit captured, card saved for the balance
//   balance_scheduled → balance charge in flight (transient)
//   paid             → balance captured, stay paid in full
//   balance_failed    → auto-charge declined; owner is alerted to retry / chase
//   cancelled         → abandoned or cancelled
// ─────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs';
import { PRICING, PROPERTIES, BOOKINGS as SEED_BOOKINGS, CANCELLATION_POLICY } from './management-data.mjs';
import { stripe } from './stripe.mjs';
import { parseICal } from './functions/availability.mjs';
import { sendEmail, bookingConfirmationEmail, balanceReceiptEmail } from './email.mjs';

export const DIRECT_STORE = 'direct-bookings';
// Statuses that occupy the calendar / count as real income.
export const ACTIVE_STATUSES = new Set(['deposit_paid', 'balance_scheduled', 'paid', 'balance_failed']);
// A just-started checkout holds the dates briefly so two guests can't race for
// the same nights while one is still on the Stripe page.
const PENDING_HOLD_MS = 30 * 60 * 1000;

const ICAL_ENV = {
  'the-rockery': 'AIRBNB_ICAL_THE_ROCKERY',
  'primrose-cottage': 'AIRBNB_ICAL_PRIMROSE_COTTAGE',
};

// ---- store helpers ----------------------------------------------------------
function store() {
  return getStore({ name: DIRECT_STORE, consistency: 'strong' });
}
export async function loadDirectBookings() {
  try {
    const list = await store().get('list', { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export async function saveDirectBookings(list) {
  await store().setJSON('list', list);
}
async function upsert(record) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === record.id);
  if (idx < 0) list.push(record);
  else list[idx] = record;
  await saveDirectBookings(list);
  return record;
}

// ---- small utils ------------------------------------------------------------
export function round2(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n || '').replace(/[^0-9.\-]/g, ''));
  return Math.round(((Number.isFinite(x) ? x : 0) + Number.EPSILON) * 100) / 100;
}
export function isoDate(v) {
  return v ? String(v).slice(0, 10) : '';
}
function pence(pounds) {
  return Math.round(round2(pounds) * 100);
}
export function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
// Two half-open date ranges [aStart,aEnd) and [bStart,bEnd) overlap?
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
// UK card fee estimate (1.5% + 20p per charge; deposit + balance = 2 charges).
function feeEstimate(total) {
  return round2(total * 0.015 + 0.4);
}
function bookableProperty(key) {
  return PRICING[key] && PRICING[key].bookable && PROPERTIES[key];
}

// ---- quoting (pure) ---------------------------------------------------------
// Validate a requested stay and compute the price breakdown. No I/O.
export function quoteStay({ property, start, end, guests, dogs, infants }) {
  const key = String(property || '').toLowerCase();
  const cfg = PRICING[key];
  if (!cfg) return { error: 'Unknown property.' };
  if (!bookableProperty(key)) return { error: `${(PROPERTIES[key] && PROPERTIES[key].name) || 'This property'} isn’t open for direct booking yet.` };

  const s = isoDate(start);
  const e = isoDate(end);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { error: 'Please choose your arrival and departure dates.' };
  }
  if (s < today()) return { error: 'Arrival date is in the past.' };
  const nights = nightsBetween(s, e);
  if (nights < 1) return { error: 'Departure must be after arrival.' };
  if (nights < cfg.minNights) return { error: `Minimum stay is ${cfg.minNights} nights.` };

  const g = Math.max(1, Math.round(Number(guests) || 1));
  if (g > cfg.maxGuests) return { error: `This property sleeps up to ${cfg.maxGuests}.` };

  const dg = Math.max(0, Math.round(Number(dogs) || 0));
  const inf = Math.max(0, Math.round(Number(infants) || 0));
  const maxDogs = cfg.maxDogs == null ? Infinity : cfg.maxDogs;
  const maxInfants = cfg.maxInfants == null ? Infinity : cfg.maxInfants;
  if (dg > maxDogs) return { error: maxDogs === 0 ? 'Sorry, dogs can’t be accommodated here.' : `Up to ${maxDogs} dog${maxDogs === 1 ? '' : 's'} can be accommodated.` };
  if (inf > maxInfants) return { error: maxInfants === 0 ? 'No cot space for under-2s here.' : `Up to ${maxInfants} child${maxInfants === 1 ? '' : 'ren'} under 2.` };

  const subtotal = round2(nights * cfg.nightly);
  const cleaning = round2(cfg.cleaningFee || 0);
  const total = round2(subtotal + cleaning);
  const deposit = round2(total * (cfg.depositPct / 100));
  const balance = round2(total - deposit);
  const balanceDueDate = addDays(s, -cfg.balanceDueDays);

  return {
    quote: {
      property: key,
      propertyName: PROPERTIES[key].name,
      start: s,
      end: e,
      nights,
      guests: g,
      dogs: dg,
      infants: inf,
      nightly: cfg.nightly,
      subtotal,
      cleaning,
      total,
      depositPct: cfg.depositPct,
      deposit,
      balance,
      balanceDueDays: cfg.balanceDueDays,
      balanceDueDate,
      currency: cfg.currency || 'GBP',
    },
  };
}

// ---- availability -----------------------------------------------------------
async function icalBusyRanges(propertyKey) {
  const url = Netlify.env.get(ICAL_ENV[propertyKey]);
  if (!url) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'LakeDistrictEscapes/1.0 (+https://lakedistrictescapes.uk)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    // parseICal returns ALL events (reservations AND owner "not available"
    // blocks) — exactly what we want when protecting against double-booking.
    return parseICal(await res.text()).map((r) => ({ start: r.from, end: r.to }));
  } catch {
    return [];
  }
}

// Gather every occupied date range for a property: seed + owner-entered
// bookings, live direct bookings, active pending holds, and the Airbnb iCal.
export async function busyRanges(propertyKey, { ignoreId } = {}) {
  const ranges = [];

  // Seed + owner (CSV/manual) bookings from management-data + mgmt-bookings blob.
  for (const b of SEED_BOOKINGS) {
    if (b.property === propertyKey && b.start && b.end) ranges.push({ start: isoDate(b.start), end: isoDate(b.end) });
  }
  try {
    const owner = await getStore({ name: 'mgmt-bookings', consistency: 'strong' }).get('list', { type: 'json' });
    if (Array.isArray(owner)) {
      for (const b of owner) {
        if (b.property === propertyKey && b.start && b.end) ranges.push({ start: isoDate(b.start), end: isoDate(b.end) });
      }
    }
  } catch {
    /* ignore */
  }

  // Direct bookings (confirmed) + recent pending holds.
  const now = Date.now();
  for (const b of await loadDirectBookings()) {
    if (b.property !== propertyKey || b.id === ignoreId) continue;
    if (ACTIVE_STATUSES.has(b.status)) {
      ranges.push({ start: b.start, end: b.end });
    } else if (b.status === 'pending' && b.createdAt && now - new Date(b.createdAt).getTime() < PENDING_HOLD_MS) {
      ranges.push({ start: b.start, end: b.end });
    }
  }

  // Live Airbnb calendar.
  ranges.push(...(await icalBusyRanges(propertyKey)));
  return ranges.filter((r) => r.start && r.end);
}

export async function isAvailable(propertyKey, start, end, opts) {
  const ranges = await busyRanges(propertyKey, opts);
  return !ranges.some((r) => rangesOverlap(start, end, r.start, r.end));
}

// ---- reference --------------------------------------------------------------
function makeRef() {
  return 'LDE-' + crypto.randomUUID().replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
}

// ---- create checkout (deposit) ---------------------------------------------
// Validates + reserves the dates, stores a pending record, and creates a Stripe
// Checkout Session for the deposit (saving the card off-session for the
// balance). Returns { url, bookingId, ref } or { error }.
export async function createCheckout(input, origin) {
  const q = quoteStay(input);
  if (q.error) return { error: q.error };
  const quote = q.quote;

  const name = String(input.name || '').trim().slice(0, 120);
  const email = String(input.email || '').trim().slice(0, 200);
  const phone = String(input.phone || '').trim().slice(0, 40);
  if (!name) return { error: 'Please enter your name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please enter a valid email address.' };

  // The owner override (validated in book.mjs) skips the availability check so a
  // deliberately-held date can be booked; everyone else is checked as normal.
  if (!input.bypassAvailability && !(await isAvailable(quote.property, quote.start, quote.end))) {
    return { error: 'Sorry — those dates have just been taken. Please choose different dates.' };
  }

  const id = crypto.randomUUID();
  const ref = makeRef();
  const nowIso = new Date().toISOString();
  const record = {
    id,
    ref,
    property: quote.property,
    guest: { name, email, phone },
    guests: quote.guests,
    dogs: quote.dogs,
    infants: quote.infants,
    start: quote.start,
    end: quote.end,
    nights: quote.nights,
    nightly: quote.nightly,
    subtotal: quote.subtotal,
    cleaning: quote.cleaning,
    total: quote.total,
    depositPct: quote.depositPct,
    deposit: quote.deposit,
    balance: quote.balance,
    balanceDueDays: quote.balanceDueDays,
    balanceDueDate: quote.balanceDueDate,
    feeEstimate: feeEstimate(quote.total),
    currency: quote.currency,
    status: 'pending',
    stripe: {},
    createdAt: nowIso,
    updatedAt: nowIso,
    history: [{ at: nowIso, event: 'checkout_started' }],
  };

  const base = (origin || Netlify.env.get('PUBLIC_SITE_URL') || 'https://lakedistrictescapes.uk').replace(/\/$/, '');
  const stayLabel = `${quote.propertyName}, ${quote.start} → ${quote.end} (${quote.nights} night${quote.nights === 1 ? '' : 's'})`;

  let session;
  try {
    session = await stripe('checkout/sessions', {
      idempotencyKey: 'checkout_' + id,
      params: {
        mode: 'payment',
        success_url: `${base}/booking-confirmed/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/book/?property=${quote.property}&cancelled=1`,
        customer_creation: 'always',
        customer_email: email,
        client_reference_id: id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: quote.currency.toLowerCase(),
              unit_amount: pence(quote.deposit),
              product_data: {
                name: `Deposit (${quote.depositPct}%) — ${quote.propertyName}`,
                description: stayLabel,
              },
            },
          },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session',
          description: `Deposit — ${ref} — ${stayLabel}`,
          metadata: { bookingId: id, ref, kind: 'deposit' },
        },
        metadata: { bookingId: id, ref, kind: 'deposit' },
      },
    });
  } catch (err) {
    return { error: 'Could not start payment: ' + err.message };
  }

  record.stripe.checkoutSessionId = session.id;
  await upsert(record);
  return { url: session.url, bookingId: id, ref };
}

// ---- webhook: deposit paid --------------------------------------------------
// Called on checkout.session.completed. Marks the deposit paid and stores the
// saved customer + payment method for the later balance charge.
export async function applyCheckoutCompleted(session) {
  const id = session.client_reference_id || (session.metadata && session.metadata.bookingId);
  if (!id) return { ignored: true, reason: 'no booking id' };

  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return { ignored: true, reason: 'unknown booking' };
  const rec = list[idx];
  if (rec.status !== 'pending') return { ok: true, alreadyProcessed: true };

  let paymentMethodId = null;
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id;
  if (piId) {
    try {
      const pi = await stripe('payment_intents/' + piId, { method: 'GET' });
      paymentMethodId = pi.payment_method || null;
    } catch {
      /* fall back to whatever the session gave us */
    }
  }

  rec.status = 'deposit_paid';
  rec.stripe = {
    ...rec.stripe,
    checkoutSessionId: session.id,
    customerId: session.customer || rec.stripe.customerId || null,
    depositPaymentIntent: piId || null,
    paymentMethodId: paymentMethodId || rec.stripe.paymentMethodId || null,
  };
  rec.depositPaidAt = new Date().toISOString();
  rec.updatedAt = rec.depositPaidAt;
  rec.history = [...(rec.history || []), { at: rec.depositPaidAt, event: 'deposit_paid', amount: rec.deposit }];
  list[idx] = rec;
  await saveDirectBookings(list);
  await maybeEmail(rec.id, 'confirmation');
  return { ok: true, booking: rec };
}

// Send one of the guest emails, at most once per kind, tracked by a flag on the
// record so the webhook and the scheduler can both call it without duplicating.
// Never throws — email problems must not break the booking flow.
export async function maybeEmail(id, kind, { force } = {}) {
  try {
    const list = await loadDirectBookings();
    const idx = list.findIndex((b) => b.id === id);
    if (idx < 0) return { skipped: 'unknown booking' };
    const rec = list[idx];
    if (!force && rec.emailed && rec.emailed[kind]) return { skipped: 'already sent' };
    const to = rec.guest && rec.guest.email;
    if (!to) return { skipped: 'no email' };

    const emailRec = { ...rec, propertyName: (PROPERTIES[rec.property] && PROPERTIES[rec.property].name) || rec.property };
    const tpl = kind === 'balanceReceipt' ? balanceReceiptEmail(emailRec) : bookingConfirmationEmail(emailRec);
    const res = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
    if (res.ok) {
      // Re-load to avoid clobbering a concurrent update, then set the flag.
      const fresh = await loadDirectBookings();
      const i = fresh.findIndex((b) => b.id === id);
      if (i >= 0) {
        fresh[i] = { ...fresh[i], emailed: { ...(fresh[i].emailed || {}), [kind]: true } };
        await saveDirectBookings(fresh);
      }
    }
    return res;
  } catch (err) {
    return { error: err.message };
  }
}

// ---- charge the balance (off-session) --------------------------------------
export async function chargeBalance(rec) {
  if (rec.status === 'paid') return { ok: true, alreadyPaid: true, booking: rec };
  if (!rec.stripe || !rec.stripe.customerId || !rec.stripe.paymentMethodId) {
    return { error: 'No saved card on file for this booking.' };
  }
  if (!(rec.balance > 0)) {
    // Nothing left to charge — treat as paid.
    return await markPaid(rec.id, null);
  }

  // Mark in-flight (best effort) so a concurrent run doesn't double-charge.
  await patch(rec.id, { status: 'balance_scheduled', updatedAt: new Date().toISOString() });

  let pi;
  try {
    pi = await stripe('payment_intents', {
      idempotencyKey: 'balance_' + rec.id,
      params: {
        amount: pence(rec.balance),
        currency: (rec.currency || 'GBP').toLowerCase(),
        customer: rec.stripe.customerId,
        payment_method: rec.stripe.paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Balance — ${rec.ref} — ${rec.property} ${rec.start}→${rec.end}`,
        metadata: { bookingId: rec.id, ref: rec.ref, kind: 'balance' },
      },
    });
  } catch (err) {
    const now = new Date().toISOString();
    const updated = await patch(rec.id, {
      status: 'balance_failed',
      balanceError: err.message,
      balanceFailedAt: now,
      updatedAt: now,
      pushHistory: { at: now, event: 'balance_failed', error: err.message },
    });
    return { error: err.message, booking: updated };
  }

  if (pi.status === 'succeeded') {
    return await markPaid(rec.id, pi.id);
  }
  // requires_action / processing — leave flagged for the owner to follow up.
  const now = new Date().toISOString();
  const updated = await patch(rec.id, {
    status: 'balance_failed',
    balanceError: `Payment needs attention (status: ${pi.status}).`,
    balanceFailedAt: now,
    updatedAt: now,
    stripePatch: { balancePaymentIntent: pi.id },
    pushHistory: { at: now, event: 'balance_pending', status: pi.status },
  });
  return { pending: true, status: pi.status, booking: updated };
}

async function markPaid(id, paymentIntentId) {
  const now = new Date().toISOString();
  const updated = await patch(id, {
    status: 'paid',
    balancePaidAt: now,
    balanceError: null,
    updatedAt: now,
    stripePatch: paymentIntentId ? { balancePaymentIntent: paymentIntentId } : undefined,
    pushHistory: { at: now, event: 'paid_in_full' },
  });
  await maybeEmail(id, 'balanceReceipt');
  return { ok: true, booking: updated };
}

// Append one or more refund entries to a booking and bump its refundedTotal.
async function persistRefunds(id, entries) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const rec = list[idx];
  const now = new Date().toISOString();
  const added = round2(entries.reduce((s, e) => s + (e.amount || 0), 0));
  const next = {
    ...rec,
    refunds: [...(rec.refunds || []), ...entries],
    refundedTotal: round2((rec.refundedTotal || 0) + added),
    updatedAt: now,
    history: [...(rec.history || []), ...entries.map((e) => ({ at: e.at || now, event: 'refund', amount: e.amount, target: e.target }))],
  };
  list[idx] = next;
  await saveDirectBookings(list);
  return next;
}

// Apply a shallow patch to a stored record by id.
async function patch(id, changes) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const rec = list[idx];
  const { stripePatch, pushHistory, ...rest } = changes;
  const next = { ...rec, ...rest };
  if (stripePatch) next.stripe = { ...rec.stripe, ...stripePatch };
  if (pushHistory) next.history = [...(rec.history || []), pushHistory];
  list[idx] = next;
  await saveDirectBookings(list);
  return next;
}

// ---- scheduled: charge every balance now due -------------------------------
export async function runDueBalances() {
  const list = await loadDirectBookings();
  const due = list.filter(
    (b) => b.status === 'deposit_paid' && b.balanceDueDate && b.balanceDueDate <= today() && b.balance > 0,
  );
  const results = [];
  for (const rec of due) {
    // reload fresh each time to respect concurrent updates
    const fresh = (await loadDirectBookings()).find((b) => b.id === rec.id);
    if (!fresh || fresh.status !== 'deposit_paid') continue;
    const r = await chargeBalance(fresh);
    results.push({ id: rec.id, ref: rec.ref, ...(r.ok ? { charged: true } : r.error ? { error: r.error } : { pending: true }) });
  }
  return { processed: results.length, results };
}

// Retry a single failed balance (owner-triggered from the dashboard).
export async function retryBalance(id) {
  const rec = (await loadDirectBookings()).find((b) => b.id === id);
  if (!rec) return { error: 'Booking not found.' };
  if (rec.status === 'paid') return { ok: true, alreadyPaid: true, booking: rec };
  // reset to deposit_paid so chargeBalance re-runs cleanly
  const reset = await patch(id, { status: 'deposit_paid' });
  return await chargeBalance(reset || rec);
}

// ---- projections ------------------------------------------------------------
// Full record → the booking shape the owner dashboard expects.
export function directToBooking(b) {
  const paid = b.status === 'paid';
  return {
    id: b.id,
    property: b.property,
    channel: 'Direct',
    code: b.ref,
    guest: (b.guest && b.guest.name) || '',
    booked: isoDate(b.createdAt),
    start: b.start,
    end: b.end,
    nights: b.nights,
    guests: b.guests,
    dogs: b.dogs || 0,
    infants: b.infants || 0,
    gross: b.total,
    fee: b.feeEstimate || 0,
    cleaning: b.cleaning || 0,
    net: round2((b.total || 0) - (b.feeEstimate || 0)),
    payout: paid ? isoDate(b.balancePaidAt || b.balanceDueDate) : '',
    currency: b.currency || 'GBP',
    source: 'direct',
    status: b.status,
    deposit: b.deposit,
    balance: b.balance,
    balanceDueDate: b.balanceDueDate,
    balanceError: b.balanceError || null,
    email: (b.guest && b.guest.email) || '',
    phone: (b.guest && b.guest.phone) || '',
  };
}
// Full record → the dates-only shape the cleaner/gardener schedule expects.
export function directToSchedule(b) {
  return { property: b.property, start: b.start, end: b.end, nights: b.nights, channel: 'Direct' };
}

// ---- cancellation policy (Flexible) ----------------------------------------
export function cancellationPolicy() {
  return CANCELLATION_POLICY;
}
// How much has actually been captured on this booking (net of prior refunds).
function amountPaid(rec) {
  const dep = rec.depositPaidAt ? rec.deposit || 0 : 0;
  const bal = rec.status === 'paid' || rec.balancePaidAt ? rec.balance || 0 : 0;
  return round2(dep + bal - (rec.refundedTotal || 0));
}
// Compute the refund the Flexible policy allows if this booking is cancelled
// now. Returns { available, suggested, reason, perNight }. `nowMs` is injectable
// for testing.
export function policyRefund(rec, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const available = Math.max(0, amountPaid(rec));
  const nights = rec.nights > 0 ? rec.nights : 1;
  const perNight = round2((rec.total || 0) / nights);
  const checkinMs = new Date(rec.start + 'T' + String(CANCELLATION_POLICY.checkinHour).padStart(2, '0') + ':00:00Z').getTime();
  const hoursUntil = (checkinMs - now) / 3600000;

  if (hoursUntil >= CANCELLATION_POLICY.fullRefundHours) {
    return { available, suggested: available, reason: `Full refund — cancelled more than ${CANCELLATION_POLICY.fullRefundHours}h before check-in.`, perNight };
  }
  // Within 24h of check-in or after arrival: first night + any begun nights are
  // non-refundable; the rest are refunded.
  const msSince = now - checkinMs;
  const nightsStayed = msSince <= 0 ? 0 : Math.min(nights, Math.floor(msSince / 86400000) + 1);
  const nonRefundableNights = Math.max(1, nightsStayed);
  const refundableByNights = Math.max(0, round2((nights - nonRefundableNights) * perNight));
  const suggested = Math.min(available, refundableByNights);
  const reason =
    nonRefundableNights >= nights
      ? 'No refund — within 24h of check-in / stay underway (all nights non-refundable).'
      : `Partial refund — within 24h of check-in: ${nonRefundableNights} night${nonRefundableNights === 1 ? '' : 's'} non-refundable.`;
  return { available, suggested: round2(suggested), reason, perNight };
}

// Full record → the admin projection for the direct-bookings management page.
// This IS gated behind the management code, so it may include contact details.
export function directToAdmin(b) {
  return {
    id: b.id,
    ref: b.ref,
    property: b.property,
    propertyName: (PROPERTIES[b.property] && PROPERTIES[b.property].name) || b.property,
    status: b.status,
    guest: { name: (b.guest && b.guest.name) || '', email: (b.guest && b.guest.email) || '', phone: (b.guest && b.guest.phone) || '' },
    guests: b.guests,
    dogs: b.dogs || 0,
    infants: b.infants || 0,
    start: b.start,
    end: b.end,
    nights: b.nights,
    nightly: b.nightly,
    subtotal: b.subtotal,
    cleaning: b.cleaning || 0,
    total: b.total,
    depositPct: b.depositPct,
    deposit: b.deposit,
    balance: b.balance,
    balanceDueDate: b.balanceDueDate,
    balanceError: b.balanceError || null,
    note: b.note || '',
    currency: b.currency || 'GBP',
    createdAt: b.createdAt || '',
    depositPaidAt: b.depositPaidAt || '',
    balancePaidAt: b.balancePaidAt || '',
    cancelledAt: b.cancelledAt || '',
    emailed: b.emailed || {},
    // Refunds
    canRefundDeposit: !!(b.stripe && b.stripe.depositPaymentIntent),
    canRefundBalance: !!(b.stripe && b.stripe.balancePaymentIntent),
    depositRefunded: round2((b.refunds || []).filter((r) => r.target === 'deposit').reduce((s, r) => s + (r.amount || 0), 0)),
    balanceRefunded: round2((b.refunds || []).filter((r) => r.target === 'balance').reduce((s, r) => s + (r.amount || 0), 0)),
    refundedTotal: b.refundedTotal || 0,
    refunds: (b.refunds || []).map((r) => ({ at: r.at, amount: r.amount, target: r.target, status: r.status })),
    // Flexible-policy guidance for a cancellation right now.
    amountPaid: amountPaid(b),
    policyTier: CANCELLATION_POLICY.tier,
    ...(() => {
      const pr = policyRefund(b);
      return { policySuggestedRefund: pr.suggested, policyRefundReason: pr.reason, policyAvailable: pr.available };
    })(),
  };
}

// List all direct bookings for the admin page (newest first).
export async function listDirectBookingsAdmin() {
  const list = await loadDirectBookings();
  return list
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(directToAdmin);
}

// Owner edit of a booking's details. Money fields are optional manual overrides
// (e.g. a bespoke rate or an added charge); if the balance hasn't been taken
// yet, a changed balance is what the auto-charge will collect. Editing here does
// NOT move money by itself. Returns { booking } (admin projection) or { error }.
export async function updateDirectBooking(id, input) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return { error: 'Booking not found.' };
  const rec = { ...list[idx] };

  if (input.name !== undefined || input.email !== undefined || input.phone !== undefined) {
    rec.guest = {
      name: input.name !== undefined ? String(input.name).trim().slice(0, 120) : rec.guest?.name || '',
      email: input.email !== undefined ? String(input.email).trim().slice(0, 200) : rec.guest?.email || '',
      phone: input.phone !== undefined ? String(input.phone).trim().slice(0, 40) : rec.guest?.phone || '',
    };
    if (rec.guest.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rec.guest.email)) {
      return { error: 'That email address doesn’t look right.' };
    }
  }

  let start = rec.start;
  let end = rec.end;
  if (input.start !== undefined) start = isoDate(input.start);
  if (input.end !== undefined) end = isoDate(input.end);
  if (!start || !end || nightsBetween(start, end) < 1) return { error: 'Check-out must be after check-in.' };
  rec.start = start;
  rec.end = end;
  rec.nights = nightsBetween(start, end);

  if (input.guests !== undefined) rec.guests = Math.max(1, Math.round(Number(input.guests) || 1));
  if (input.dogs !== undefined) rec.dogs = Math.max(0, Math.round(Number(input.dogs) || 0));
  if (input.infants !== undefined) rec.infants = Math.max(0, Math.round(Number(input.infants) || 0));
  if (input.note !== undefined) rec.note = String(input.note).slice(0, 1000);

  const cfg = PRICING[rec.property] || {};
  const balanceDueDays = cfg.balanceDueDays != null ? cfg.balanceDueDays : rec.balanceDueDays || 7;
  // Recompute the balance-due date from the (possibly new) check-in, unless the
  // owner set one explicitly.
  rec.balanceDueDate = input.balanceDueDate ? isoDate(input.balanceDueDate) : addDays(rec.start, -balanceDueDays);

  if (input.total !== undefined && input.total !== '') rec.total = round2(input.total);
  if (input.deposit !== undefined && input.deposit !== '') rec.deposit = round2(input.deposit);
  if (input.balance !== undefined && input.balance !== '') rec.balance = round2(input.balance);
  // Keep the fee estimate roughly in step if the total changed.
  rec.feeEstimate = feeEstimate(rec.total);

  rec.updatedAt = new Date().toISOString();
  rec.history = [...(rec.history || []), { at: rec.updatedAt, event: 'edited' }];
  list[idx] = rec;
  await saveDirectBookings(list);
  return { booking: directToAdmin(rec) };
}

// Refund all or part of a booking's payment via Stripe. `target` is 'deposit'
// or 'balance' (each is a separate Stripe charge); `amount` (in £) is optional —
// omit it for a full refund of that payment's remaining balance. Stripe enforces
// the ceiling (you can't refund more than was captured). Returns
// { booking, refund } or { error }.
export async function refundBooking(id, { target, amount, reason } = {}) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return { error: 'Booking not found.' };
  const rec = list[idx];

  // 'auto' — spread a total refund amount across the balance charge first, then
  // the deposit (used by the "Refund per policy" button). Makes up to two Stripe
  // refunds and records each.
  if (target === 'auto') {
    let remaining = round2(amount);
    if (!(remaining > 0)) return { error: 'Refund amount must be greater than £0.' };
    const refundedFor = (t) => round2((rec.refunds || []).filter((r) => r.target === t).reduce((s, r) => s + (r.amount || 0), 0));
    const legs = [
      { t: 'balance', pi: rec.stripe && rec.stripe.balancePaymentIntent, cap: round2((rec.status === 'paid' || rec.balancePaidAt ? rec.balance : 0) - refundedFor('balance')) },
      { t: 'deposit', pi: rec.stripe && rec.stripe.depositPaymentIntent, cap: round2((rec.depositPaidAt ? rec.deposit : 0) - refundedFor('deposit')) },
    ];
    const done = [];
    for (const leg of legs) {
      if (remaining <= 0) break;
      if (!leg.pi || leg.cap <= 0) continue;
      const take = Math.min(remaining, leg.cap);
      if (take <= 0) continue;
      let refund;
      try {
        refund = await stripe('refunds', { params: { payment_intent: leg.pi, amount: pence(take), metadata: { bookingId: id, ref: rec.ref, target: leg.t, note: reason ? String(reason).slice(0, 200) : 'policy' } } });
      } catch (err) {
        // Record any legs already done, then report the failure.
        if (done.length) await persistRefunds(id, done);
        return { error: err.message, partial: done.length ? done : undefined };
      }
      done.push({ at: new Date().toISOString(), amount: round2((refund.amount || 0) / 100), target: leg.t, stripeId: refund.id, status: refund.status });
      remaining = round2(remaining - take);
    }
    if (!done.length) return { error: 'There is nothing left to refund on this booking.' };
    const updated = await persistRefunds(id, done);
    return { booking: directToAdmin(updated), refund: { amount: round2(done.reduce((s, d) => s + d.amount, 0)), legs: done } };
  }

  const which = target === 'balance' ? 'balance' : 'deposit';
  const piId = which === 'balance' ? rec.stripe && rec.stripe.balancePaymentIntent : rec.stripe && rec.stripe.depositPaymentIntent;
  if (!piId) return { error: `There's no ${which} payment on file to refund.` };

  const params = { payment_intent: piId, metadata: { bookingId: id, ref: rec.ref, target: which } };
  if (amount !== undefined && amount !== null && amount !== '') {
    const amt = round2(amount);
    if (!(amt > 0)) return { error: 'Refund amount must be greater than £0.' };
    params.amount = pence(amt);
  }
  if (reason) params.metadata.note = String(reason).slice(0, 200);

  let refund;
  try {
    refund = await stripe('refunds', { params });
  } catch (err) {
    return { error: err.message };
  }

  const now = new Date().toISOString();
  const entry = { at: now, amount: round2((refund.amount || 0) / 100), target: which, stripeId: refund.id, status: refund.status };
  rec.refunds = [...(rec.refunds || []), entry];
  rec.refundedTotal = round2((rec.refundedTotal || 0) + entry.amount);
  rec.updatedAt = now;
  rec.history = [...(rec.history || []), { at: now, event: 'refund', amount: entry.amount, target: which }];
  list[idx] = rec;
  await saveDirectBookings(list);
  return { booking: directToAdmin(rec), refund: entry };
}

// Permanently delete a booking record (for test/erroneous bookings). This
// removes it everywhere — list, schedule, dashboard. Does NOT refund; any refund
// is handled in Stripe. Returns { ok, id } or { error }.
export async function deleteDirectBooking(id) {
  const list = await loadDirectBookings();
  if (!list.some((b) => b.id === id)) return { error: 'Booking not found.' };
  await saveDirectBookings(list.filter((b) => b.id !== id));
  return { ok: true, id };
}

// Cancel a booking — frees the dates on the site + schedule. Does NOT refund;
// refunds are handled in Stripe. Returns { booking } or { error }.
export async function cancelDirectBooking(id) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0) return { error: 'Booking not found.' };
  const now = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    status: 'cancelled',
    cancelledAt: now,
    updatedAt: now,
    history: [...(list[idx].history || []), { at: now, event: 'cancelled' }],
  };
  await saveDirectBookings(list);
  return { booking: directToAdmin(list[idx]) };
}

// Guest-facing lookup for the confirmation page (by Stripe Checkout session id).
// Returns only non-sensitive fields — never the saved card, email or phone.
export async function findBySessionPublic(sessionId) {
  if (!sessionId) return null;
  const rec = (await loadDirectBookings()).find((b) => b.stripe && b.stripe.checkoutSessionId === sessionId);
  if (!rec) return null;
  return {
    ref: rec.ref,
    property: rec.property,
    propertyName: (PROPERTIES[rec.property] && PROPERTIES[rec.property].name) || rec.property,
    start: rec.start,
    end: rec.end,
    nights: rec.nights,
    guests: rec.guests,
    dogs: rec.dogs || 0,
    infants: rec.infants || 0,
    total: rec.total,
    deposit: rec.deposit,
    balance: rec.balance,
    balanceDueDate: rec.balanceDueDate,
    currency: rec.currency || 'GBP',
    // 'paid' here means the deposit is in (or the whole stay for short-notice
    // bookings); 'pending' just means the webhook hasn't landed yet.
    depositPaid: rec.status !== 'pending',
    status: rec.status,
  };
}
