import { constructWebhookEvent } from '../stripe.mjs';
import { applyCheckoutCompleted, loadDirectBookings, saveDirectBookings, maybeEmail } from '../direct-bookings.mjs';

// Netlify Function (v2) — Stripe webhook endpoint.
//
//   POST /api/stripe-webhook   (called by Stripe, verified by signature)
//
// Handles:
//   • checkout.session.completed        → deposit paid, save card for the balance
//   • payment_intent.succeeded (balance) → mark paid in full  (backup to the
//                                           synchronous result in the scheduler)
//   • payment_intent.payment_failed (balance) → flag for owner follow-up
//
// Set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret. The raw request
// body is required for signature verification, so we read req.text() (never
// req.json()).

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const secret = Netlify.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook not configured.' }, 503);

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = constructWebhookEvent(raw, sig, secret);
  } catch (err) {
    // 400 tells Stripe the signature/timestamp was rejected.
    return json({ error: 'Signature verification failed: ' + err.message }, 400);
  }

  try {
    const obj = event.data && event.data.object ? event.data.object : {};
    switch (event.type) {
      case 'checkout.session.completed': {
        // Only for our deposit sessions (payment mode, has a booking id).
        if (obj.mode === 'payment') await applyCheckoutCompleted(obj);
        break;
      }
      case 'payment_intent.succeeded': {
        if (obj.metadata && obj.metadata.kind === 'balance' && obj.metadata.bookingId) {
          await markBalancePaid(obj.metadata.bookingId, obj.id);
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        if (obj.metadata && obj.metadata.kind === 'balance' && obj.metadata.bookingId) {
          const msg = (obj.last_payment_error && obj.last_payment_error.message) || 'Balance payment failed.';
          await flagBalanceFailed(obj.metadata.bookingId, msg);
        }
        break;
      }
      default:
        break; // ignore everything else
    }
  } catch (err) {
    // Ask Stripe to retry on a transient processing error.
    return json({ error: 'Processing error: ' + err.message }, 500);
  }

  return json({ received: true });
};

async function markBalancePaid(id, piId) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0 || list[idx].status === 'paid') return;
  const now = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    status: 'paid',
    balancePaidAt: now,
    balanceError: null,
    updatedAt: now,
    stripe: { ...list[idx].stripe, balancePaymentIntent: piId },
    history: [...(list[idx].history || []), { at: now, event: 'paid_in_full', via: 'webhook' }],
  };
  await saveDirectBookings(list);
  await maybeEmail(id, 'balanceReceipt');
}

async function flagBalanceFailed(id, message) {
  const list = await loadDirectBookings();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0 || list[idx].status === 'paid') return;
  const now = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    status: 'balance_failed',
    balanceError: message,
    balanceFailedAt: now,
    updatedAt: now,
    history: [...(list[idx].history || []), { at: now, event: 'balance_failed', via: 'webhook', error: message }],
  };
  await saveDirectBookings(list);
}

export const config = {
  path: '/api/stripe-webhook',
};
