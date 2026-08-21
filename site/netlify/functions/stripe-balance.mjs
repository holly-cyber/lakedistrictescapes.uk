import { runDueBalances } from '../direct-bookings.mjs';
import { stripeConfigured } from '../stripe.mjs';

// Netlify SCHEDULED Function (v2) — auto-charge balances that are now due.
//
// Runs once a day. For every direct booking whose deposit is paid and whose
// balance-due date (check-in minus `balanceDueDays`, default 7) has arrived, it
// charges the remaining balance to the card saved at booking time
// (off-session). Successes flip the booking to "paid"; declines are flagged
// "balance_failed" for the owner to retry/chase from the dashboard.
//
// Netlify invokes this on the schedule below. It can also be triggered manually
// from the Netlify UI, or by the owner dashboard's "retry balance" action for a
// single booking.

export default async () => {
  if (!stripeConfigured()) {
    return new Response(JSON.stringify({ skipped: 'Stripe not configured.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let summary;
  try {
    summary = await runDueBalances();
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, ...summary, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  // Every day at 09:00 UTC. Charges anything whose balance-due date has passed,
  // so exact timing doesn't matter — a missed day is caught the next run.
  schedule: '0 9 * * *',
};
