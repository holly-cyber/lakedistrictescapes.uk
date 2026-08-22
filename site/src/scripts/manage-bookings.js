// Direct-bookings management page (gated, on the management subdomain).
// View every direct/Stripe booking, edit guest + date + money details, resend
// the confirmation, retry a failed balance, or cancel. Talks to /api/management
// with the owner's access code.

function el(tag, props, children) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'html') n.innerHTML = props[k];
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
const esc = (s) => String(s == null ? '' : s);
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS = {
  deposit_paid: ['Deposit paid', 'mb-st--deposit'],
  balance_scheduled: ['Charging balance', 'mb-st--scheduled'],
  paid: ['Paid in full', 'mb-st--paid'],
  balance_failed: ['Balance failed', 'mb-st--failed'],
  pending: ['Awaiting deposit', 'mb-st--pending'],
  cancelled: ['Cancelled', 'mb-st--cancelled'],
};

export function initBookingsAdmin(root, data, ctx) {
  const state = { bookings: (data && data.bookings) || [], filter: 'all' };

  async function api(action, payload) {
    const res = await fetch(ctx.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ctx.code, action, ...payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong.');
    return out;
  }

  function replace(updated) {
    const i = state.bookings.findIndex((b) => b.id === updated.id);
    if (i >= 0) state.bookings[i] = updated;
    render();
  }

  function remove(id) {
    state.bookings = state.bookings.filter((b) => b.id !== id);
    render();
  }

  function toast(msg, kind) {
    let t = root.querySelector('.mb-toast');
    if (!t) {
      t = el('div', { class: 'mb-toast' });
      root.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'mb-toast show ' + (kind === 'err' ? 'err' : 'ok');
    setTimeout(() => { t.className = 'mb-toast'; }, 3200);
  }

  const FILTERS = [
    ['all', 'All'],
    ['deposit_paid', 'Awaiting balance'],
    ['balance_failed', 'Needs attention'],
    ['paid', 'Paid'],
    ['cancelled', 'Cancelled'],
  ];

  function matches(b) {
    if (state.filter === 'all') return b.status !== 'pending';
    return b.status === state.filter;
  }

  function statusPill(b) {
    const s = STATUS[b.status] || [b.status, 'mb-st--pending'];
    return el('span', { class: 'mb-st ' + s[1], text: s[0] });
  }

  function fieldRow(label, valueNode) {
    return el('div', { class: 'mb-frow' }, [el('span', { class: 'mb-flabel', text: label }), valueNode]);
  }

  function viewCard(b) {
    const ccy = b.currency || 'GBP';
    const head = el('div', { class: 'mb-head' }, [
      el('div', {}, [
        el('span', { class: 'mb-ref', text: b.ref }),
        el('span', { class: 'mb-prop', text: b.propertyName }),
      ]),
      statusPill(b),
    ]);

    const guestBits = [el('strong', { text: b.guest.name || '—' })];
    if (b.guest.email) guestBits.push(el('a', { href: 'mailto:' + b.guest.email, text: b.guest.email }));
    if (b.guest.phone) guestBits.push(el('a', { href: 'tel:' + b.guest.phone.replace(/\s+/g, ''), text: b.guest.phone }));

    const grid = el('div', { class: 'mb-grid' }, [
      fieldRow('Guest', el('div', { class: 'mb-guest' }, guestBits)),
      fieldRow('Guests', el('span', { text: String(b.guests) })),
      fieldRow('Check-in', el('span', { text: fmtDate(b.start) })),
      fieldRow('Check-out', el('span', { text: fmtDate(b.end) + ' · ' + b.nights + ' night' + (b.nights === 1 ? '' : 's') })),
      fieldRow('Total', el('span', { text: money(b.total, ccy) })),
      fieldRow('Deposit', el('span', { text: money(b.deposit, ccy) + (b.depositPaidAt ? ' · paid ' + fmtWhen(b.depositPaidAt) : '') })),
      fieldRow(
        'Balance',
        el('span', {
          text:
            b.status === 'paid'
              ? money(b.balance, ccy) + ' · paid ' + fmtWhen(b.balancePaidAt)
              : money(b.balance, ccy) + ' · due ' + fmtDate(b.balanceDueDate),
        }),
      ),
    ]);
    if (b.note) grid.appendChild(fieldRow('Note', el('span', { text: b.note })));
    if (b.balanceError) grid.appendChild(fieldRow('Last error', el('span', { class: 'mb-err', text: b.balanceError })));

    const actions = el('div', { class: 'mb-actions' });
    if (b.status !== 'cancelled') {
      actions.appendChild(el('button', { class: 'mb-btn', type: 'button', text: 'Edit', onclick: () => editCard(b) }));
      actions.appendChild(el('button', {
        class: 'mb-btn mb-btn-ghost', type: 'button', text: 'Resend confirmation',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await api('resendConfirmation', { id: b.id });
            toast(r.ok ? 'Confirmation email sent.' : 'Email not sent — email isn’t set up yet.', r.ok ? 'ok' : 'err');
          } catch (err) { toast(err.message, 'err'); }
          e.target.disabled = false;
        },
      }));
      if (b.status === 'balance_failed') {
        actions.appendChild(el('button', {
          class: 'mb-btn mb-btn-warn', type: 'button', text: 'Retry balance',
          onclick: async (e) => {
            if (!window.confirm('Retry charging the ' + money(b.balance, ccy) + ' balance now?')) return;
            e.target.disabled = true;
            try { const r = await api('retryBalance', { id: b.id }); if (r.booking) replace(r.booking); toast(r.paid ? 'Balance charged.' : 'Charge attempted.', r.paid ? 'ok' : 'err'); }
            catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
          },
        }));
      }
      actions.appendChild(el('button', {
        class: 'mb-btn mb-btn-danger', type: 'button', text: 'Cancel booking',
        onclick: async (e) => {
          if (!window.confirm('Cancel ' + b.ref + '? This frees the dates but does NOT refund — do any refund in Stripe.')) return;
          e.target.disabled = true;
          try { const r = await api('cancelDirectBooking', { id: b.id }); if (r.booking) replace(r.booking); toast('Booking cancelled.', 'ok'); }
          catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
        },
      }));
    }
    // Permanent delete — for test or erroneous bookings. Available on any status.
    actions.appendChild(el('button', {
      class: 'mb-btn mb-btn-danger', type: 'button', text: 'Delete',
      onclick: async (e) => {
        if (!window.confirm('Permanently delete ' + b.ref + '? This removes it from the list, schedule and dashboard for good. Use for test or mistaken bookings — it does NOT refund (do that in Stripe).')) return;
        e.target.disabled = true;
        try { await api('deleteDirectBooking', { id: b.id }); remove(b.id); toast('Booking deleted.', 'ok'); }
        catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
      },
    }));

    return el('div', { class: 'mb-card' }, [head, grid, actions]);
  }

  function editCard(b) {
    const ccy = b.currency || 'GBP';
    const inputs = {};
    const mk = (name, value, type) => {
      const i = el('input', { class: 'mb-in', type: type || 'text', value: value == null ? '' : String(value) });
      inputs[name] = i;
      return i;
    };
    const grid = el('div', { class: 'mb-editgrid' }, [
      fieldRow('Name', mk('name', b.guest.name)),
      fieldRow('Email', mk('email', b.guest.email, 'email')),
      fieldRow('Phone', mk('phone', b.guest.phone, 'tel')),
      fieldRow('Guests', mk('guests', b.guests, 'number')),
      fieldRow('Check-in', mk('start', b.start, 'date')),
      fieldRow('Check-out', mk('end', b.end, 'date')),
      fieldRow('Balance due', mk('balanceDueDate', b.balanceDueDate, 'date')),
      fieldRow('Total (£)', mk('total', b.total, 'number')),
      fieldRow('Deposit (£)', mk('deposit', b.deposit, 'number')),
      fieldRow('Balance (£)', mk('balance', b.balance, 'number')),
    ]);
    const note = el('textarea', { class: 'mb-in mb-note', rows: '2', text: b.note || '' });
    grid.appendChild(fieldRow('Note', note));

    const hint = el('p', { class: 'mb-hint', text: 'Editing details here updates the record only — it does not move money. If the balance hasn’t been taken yet, a changed “Balance” is what will be auto-charged.' });

    const save = el('button', {
      class: 'mb-btn mb-btn-save', type: 'button', text: 'Save changes',
      onclick: async () => {
        save.disabled = true;
        save.textContent = 'Saving…';
        try {
          const payload = { id: b.id, note: note.value };
          for (const k in inputs) payload[k] = inputs[k].value;
          const r = await api('updateDirectBooking', payload);
          replace(r.booking);
          toast('Booking updated.', 'ok');
        } catch (err) {
          toast(err.message, 'err');
          save.disabled = false;
          save.textContent = 'Save changes';
        }
      },
    });
    const cancel = el('button', { class: 'mb-btn mb-btn-ghost', type: 'button', text: 'Cancel', onclick: () => render() });

    const head = el('div', { class: 'mb-head' }, [
      el('div', {}, [el('span', { class: 'mb-ref', text: b.ref }), el('span', { class: 'mb-prop', text: 'Editing' })]),
      statusPill(b),
    ]);
    const cardEl = el('div', { class: 'mb-card mb-card-edit' }, [head, grid, hint, el('div', { class: 'mb-actions' }, [save, cancel])]);

    // Swap just this card in place.
    const existing = root.querySelector('[data-id="' + b.id + '"]');
    if (existing) {
      cardEl.setAttribute('data-id', b.id);
      existing.replaceWith(cardEl);
    } else {
      render();
    }
  }

  function render() {
    root.textContent = '';

    const filters = el('div', { class: 'mb-filters' }, FILTERS.map(([id, label]) => {
      const count = id === 'all' ? state.bookings.filter((b) => b.status !== 'pending').length : state.bookings.filter((b) => b.status === id).length;
      return el('button', {
        class: 'mb-filter' + (state.filter === id ? ' is-on' : ''),
        type: 'button',
        text: label + ' (' + count + ')',
        onclick: () => { state.filter = id; render(); },
      });
    }));
    root.appendChild(filters);

    const shown = state.bookings.filter(matches).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (!shown.length) {
      root.appendChild(el('div', { class: 'mb-empty', text: 'No bookings in this view yet.' }));
      return;
    }
    const list = el('div', { class: 'mb-list' });
    shown.forEach((b) => {
      const c = viewCard(b);
      c.setAttribute('data-id', b.id);
      list.appendChild(c);
    });
    root.appendChild(list);
  }

  render();
}
