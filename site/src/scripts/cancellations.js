// Cancellations & refunds report (gated). Shows every cancelled direct booking
// and any refunds made, with a CSV download. Reads the same `directBookings`
// admin feed as the manager page — no separate API.

function el(tag, props, children) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null) n.setAttribute(k, props[k]);
    }
  }
  if (children != null) {
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }
  return n;
}
const money = (n, ccy = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).format(Number(n) || 0);
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date((iso.length <= 10 ? iso + 'T00:00:00Z' : iso));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
// One-line summary of a booking's refunds, e.g. "£50.00 deposit, £262.50 balance".
function refundSummary(b, ccy) {
  if (!b.refunds || !b.refunds.length) return '';
  return b.refunds.map((r) => money(r.amount, ccy) + ' ' + r.target).join(', ');
}

export function initCancellations(root, data, ctx) {
  const all = (data && data.bookings) || [];
  // Cancelled bookings, plus any booking that has a refund (even if still active).
  const rows = all
    .filter((b) => b.status === 'cancelled' || (b.refunds && b.refunds.length) || b.refundedTotal > 0)
    .sort((a, b) => String(b.cancelledAt || b.createdAt || '').localeCompare(String(a.cancelledAt || a.createdAt || '')));

  function csv() {
    const header = [
      'Reference', 'Property', 'Guest', 'Email', 'Check-in', 'Check-out', 'Nights',
      'Status', 'Total', 'Deposit', 'Balance', 'Refunded total', 'Refund detail', 'Cancelled', 'Booked',
    ];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(',')];
    rows.forEach((b) => {
      const ccy = b.currency || 'GBP';
      lines.push([
        b.ref, b.propertyName, b.guest.name, b.guest.email, b.start, b.end, b.nights,
        b.status === 'cancelled' ? 'Cancelled' : b.status,
        b.total, b.deposit, b.balance, b.refundedTotal || 0,
        refundSummary(b, ccy), b.cancelledAt ? fmtDate(b.cancelledAt) : '', fmtDate(b.createdAt),
      ].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cancellations-refunds.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function render() {
    root.textContent = '';
    root.appendChild(el('div', { class: 'mb-topbar' }, [
      el('a', { class: 'mb-back', href: '/management/bookings/' }, '← Back to bookings'),
    ]));

    const totalRefunded = rows.reduce((s, b) => s + (b.refundedTotal || 0), 0);
    const cancelledCount = rows.filter((b) => b.status === 'cancelled').length;

    root.appendChild(el('div', { class: 'cr-summary' }, [
      el('div', { class: 'cr-stat' }, [el('span', { class: 'cr-stat-n', text: String(cancelledCount) }), el('span', { class: 'cr-stat-l', text: 'Cancelled' })]),
      el('div', { class: 'cr-stat' }, [el('span', { class: 'cr-stat-n', text: String(rows.filter((b) => (b.refundedTotal || 0) > 0).length) }), el('span', { class: 'cr-stat-l', text: 'With refunds' })]),
      el('div', { class: 'cr-stat' }, [el('span', { class: 'cr-stat-n', text: money(totalRefunded) }), el('span', { class: 'cr-stat-l', text: 'Total refunded' })]),
    ]));

    if (!rows.length) {
      root.appendChild(el('div', { class: 'mb-empty', text: 'No cancellations or refunds yet.' }));
      return;
    }

    const dl = el('button', { class: 'mb-btn mb-btn-ghost cr-csv', type: 'button', text: '⬇ Download CSV', onclick: csv });
    root.appendChild(el('div', { class: 'cr-toolbar' }, [dl]));

    const head = el('tr', {}, ['Ref', 'Property', 'Guest', 'Dates', 'Status', 'Total', 'Refunded', 'Refund detail'].map((h) => el('th', { text: h })));
    const body = rows.map((b) => {
      const ccy = b.currency || 'GBP';
      const statusCell = b.status === 'cancelled'
        ? el('span', { class: 'mb-st mb-st--cancelled', text: 'Cancelled' })
        : el('span', { class: 'mb-st mb-st--paid', text: b.status === 'paid' ? 'Paid' : 'Active' });
      return el('tr', {}, [
        el('td', { text: b.ref }),
        el('td', { text: b.propertyName }),
        el('td', {}, [el('div', { text: b.guest.name || '—' }), b.guest.email ? el('a', { class: 'cr-email', href: 'mailto:' + b.guest.email, text: b.guest.email }) : null]),
        el('td', { text: fmtDate(b.start) + ' → ' + fmtDate(b.end) }),
        el('td', {}, statusCell),
        el('td', { class: 'cr-num', text: money(b.total, ccy) }),
        el('td', { class: 'cr-num', text: money(b.refundedTotal || 0, ccy) }),
        el('td', { class: 'cr-detail', text: refundSummary(b, ccy) || '—' }),
      ]);
    });

    root.appendChild(el('div', { class: 'cr-scroll' }, [
      el('table', { class: 'cr-table' }, [el('thead', {}, head), el('tbody', {}, body)]),
    ]));
  }

  render();
}
