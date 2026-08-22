// ─────────────────────────────────────────────────────────────────────────
// Transactional email for direct bookings, via Resend (https://resend.com).
// Sends a branded booking confirmation on deposit and a paid-in-full receipt
// when the balance clears. The owner is BCC'd so every booking lands in her
// inbox too.
//
// Config (Netlify env):
//   RESEND_API_KEY      — required to send; without it, sending is skipped
//                         silently so the booking flow never breaks.
//   BOOKING_FROM_EMAIL  — the "from" address, e.g.
//                         "Lake District Escapes <hello@lakedistrictescapes.uk>".
//                         The domain must be verified in Resend.
//   BOOKING_OWNER_EMAIL — optional BCC so the owner gets a copy of each email
//                         (kept server-side only — never in page source).
//   BOOKING_REPLY_TO    — optional Reply-To (defaults to the from address).
//
// The domain (lakedistrictescapes.uk) must be verified in Resend first
// (DKIM/SPF DNS records) so mail sends from the brand, not a personal address.
// ─────────────────────────────────────────────────────────────────────────

import { CANCELLATION_POLICY } from './management-data.mjs';

const BRAND = '#6f7357';
const MINT = '#d8eae5';
const INK = '#2e3028';

export function emailConfigured() {
  return Boolean(Netlify.env.get('RESEND_API_KEY'));
}

function money(n, ccy = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).format(Number(n) || 0);
}
function longDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Low-level send. Returns { ok } | { skipped } | { error }. Never throws.
export async function sendEmail({ to, subject, html, bcc, replyTo }) {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  if (!apiKey) return { skipped: 'no RESEND_API_KEY' };
  const from = Netlify.env.get('BOOKING_FROM_EMAIL') || 'Lake District Escapes <hello@lakedistrictescapes.uk>';
  const owner = Netlify.env.get('BOOKING_OWNER_EMAIL');
  const reply = replyTo || Netlify.env.get('BOOKING_REPLY_TO') || undefined;
  const bccList = [bcc, owner].filter(Boolean);

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (bccList.length) payload.bcc = bccList;
  if (reply) payload.reply_to = reply;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = `Resend responded ${res.status}`;
      try {
        const j = await res.json();
        if (j && j.message) msg = j.message;
      } catch {
        /* ignore */
      }
      return { error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}

// Shared HTML shell for both emails.
function shell(title, bodyRows, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f0f4f2;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;">
  <tr><td style="background:${BRAND};padding:22px 28px;">
    <div style="color:#ffffff;font-size:20px;font-weight:bold;">Lake District Escapes</div>
    <div style="color:${MINT};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">${esc(title)}</div>
  </td></tr>
  <tr><td style="padding:26px 28px;color:${INK};font-size:15px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">
    ${bodyRows}
  </td></tr>
  <tr><td style="padding:16px 28px 26px;color:#7a7d70;font-size:12px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #eceee6;">
    Lake District Escapes · Shap, Cumbria · Reply to this email if you have any questions about your stay.
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// Itemised booking table shared by both emails.
function breakdown(rec) {
  const ccy = rec.currency || 'GBP';
  const row = (label, val, strong) =>
    `<tr><td style="padding:6px 0;color:#555;">${esc(label)}</td><td style="padding:6px 0;text-align:right;${strong ? 'font-weight:bold;color:' + INK : 'color:' + INK};">${esc(val)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;border-collapse:collapse;margin:6px 0 4px;">
    ${row(`${rec.nights} night${rec.nights === 1 ? '' : 's'} × ${money(rec.nightly, ccy)}`, money(rec.subtotal, ccy))}
    ${rec.cleaning > 0 ? row('Cleaning', money(rec.cleaning, ccy)) : ''}
    <tr><td colspan="2" style="border-top:1px solid #eceee6;font-size:0;line-height:0;">&nbsp;</td></tr>
    ${row('Total', money(rec.total, ccy), true)}
    ${row('Deposit paid', money(rec.deposit, ccy))}
    ${row(`Balance (${longDate(rec.balanceDueDate)})`, money(rec.balance, ccy))}
  </table>`;
}

// Booking confirmation — sent when the deposit is paid.
export function bookingConfirmationEmail(rec) {
  const name = (rec.guest && rec.guest.name) || 'there';
  const body = `
    <p style="margin:0 0 14px;">Hi ${esc(name.split(' ')[0])},</p>
    <p style="margin:0 0 14px;">Thank you for booking <strong>${esc(rec.propertyName || 'your stay')}</strong> — your dates are confirmed and your deposit has been received.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8f5;border-radius:10px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:12px;color:#7a7d70;letter-spacing:0.06em;text-transform:uppercase;">Booking reference</div>
        <div style="font-size:18px;font-weight:bold;color:${BRAND};letter-spacing:0.04em;">${esc(rec.ref)}</div>
        <div style="margin-top:10px;"><strong>Arrive:</strong> ${esc(longDate(rec.start))}</div>
        <div><strong>Depart:</strong> ${esc(longDate(rec.end))}</div>
        <div><strong>Guests:</strong> ${esc(String(rec.guests))}</div>
        ${rec.infants ? `<div><strong>Children under 2:</strong> ${esc(String(rec.infants))}</div>` : ''}
        ${rec.dogs ? `<div><strong>Dogs:</strong> ${esc(String(rec.dogs))}</div>` : ''}
      </td></tr>
    </table>
    ${breakdown(rec)}
    <p style="margin:16px 0 14px;">The remaining balance of <strong>${esc(money(rec.balance, rec.currency))}</strong> will be charged automatically to the same card on <strong>${esc(longDate(rec.balanceDueDate))}</strong> — you don't need to do anything.</p>
    <p style="margin:16px 0 6px;font-size:13px;color:#7a7d70;"><strong>${esc(CANCELLATION_POLICY.tier)} cancellation:</strong> ${esc(CANCELLATION_POLICY.summary)}</p>
    <p style="margin:0 0 6px;">We'll send full directions and arrival details closer to the time. If anything changes or you have a question, just reply to this email.</p>
    <p style="margin:16px 0 0;">We look forward to welcoming you.<br/>— The Lake District Escapes team</p>`;
  return {
    subject: `Booking confirmed — ${rec.propertyName || 'your stay'} (${rec.ref})`,
    html: shell('Booking confirmed', body, `Your stay at ${rec.propertyName} is confirmed — ref ${rec.ref}`),
  };
}

// Paid-in-full receipt — sent when the balance is charged.
export function balanceReceiptEmail(rec) {
  const name = (rec.guest && rec.guest.name) || 'there';
  const body = `
    <p style="margin:0 0 14px;">Hi ${esc(name.split(' ')[0])},</p>
    <p style="margin:0 0 14px;">Your balance for <strong>${esc(rec.propertyName || 'your stay')}</strong> has been paid — you're all set. Here's your full receipt.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8f5;border-radius:10px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:12px;color:#7a7d70;letter-spacing:0.06em;text-transform:uppercase;">Booking reference</div>
        <div style="font-size:18px;font-weight:bold;color:${BRAND};letter-spacing:0.04em;">${esc(rec.ref)}</div>
        <div style="margin-top:10px;"><strong>Arrive:</strong> ${esc(longDate(rec.start))}</div>
        <div><strong>Depart:</strong> ${esc(longDate(rec.end))}</div>
        <div style="margin-top:8px;color:${BRAND};font-weight:bold;">Paid in full ✓</div>
      </td></tr>
    </table>
    ${breakdown(rec)}
    <p style="margin:16px 0 0;">We'll be in touch with directions and arrival details before you travel. Reply any time with questions.</p>
    <p style="margin:16px 0 0;">See you soon,<br/>— The Lake District Escapes team</p>`;
  return {
    subject: `Paid in full — ${rec.propertyName || 'your stay'} (${rec.ref})`,
    html: shell('Payment received', body, `Balance received — ref ${rec.ref}, paid in full`),
  };
}
