// Changeover schedule for the cleaner & gardener. Given { properties, bookings }
// (dates only — no money) it renders a mobile-friendly list of upcoming stays,
// with the departure day highlighted as the cleaning/turnaround day.

function e(tag, props, children) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else n.setAttribute(k, props[k]);
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { y, m, d, wd: dt.getUTCDay() };
}
function fmtDate(iso) {
  const p = dateParts(iso);
  return WEEKDAYS[p.wd] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
}
function monthKey(iso) {
  return iso.slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MONTHS_LONG[m - 1] + ' ' + y;
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysUntil(iso) {
  const t = new Date(todayIso() + 'T00:00:00Z');
  const d = new Date(iso + 'T00:00:00Z');
  return Math.round((d - t) / 86400000);
}
function relDay(iso) {
  const n = daysUntil(iso);
  if (n < 0) return null;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return 'In ' + n + ' days';
  return null;
}

export function initSchedule(root, data) {
  const properties = data.properties || {};
  const all = (data.bookings || []).slice();
  let view = 'all';

  // Which same-day turnarounds exist (a departure with a new arrival same day
  // at the same property)? Precompute for badges.
  const arrivalsByKey = new Set(all.map((b) => b.property + '|' + b.start));
  all.forEach((b) => {
    b.sameDayTurnaround = arrivalsByKey.has(b.property + '|' + b.end);
  });

  const propLabel = (key) => (key === 'the-rockery' ? (properties['the-rockery'] || {}).name || 'The Rockery' : (properties['primrose-cottage'] || {}).name || 'Primrose Cottage');
  const propShort = (key) => (properties[key] || {}).short || propLabel(key);

  const toggle = e('div', { class: 'sched-toggle', role: 'tablist' });
  const tabs = [{ id: 'all', label: 'All' }];
  // Only offer a property tab if it actually has bookings.
  if (all.some((b) => b.property === 'primrose-cottage')) tabs.push({ id: 'primrose-cottage', label: propLabel('primrose-cottage') });
  if (all.some((b) => b.property === 'the-rockery')) tabs.push({ id: 'the-rockery', label: propLabel('the-rockery') });

  const listWrap = e('div', { class: 'sched-list' });

  function setView(id) {
    view = id;
    [...toggle.children].forEach((btn) => btn.classList.toggle('active', btn.dataset.v === id));
    render();
  }
  tabs.forEach((t, i) => {
    const btn = e('button', { class: 'sched-tgl' + (i === 0 ? ' active' : ''), type: 'button', text: t.label });
    btn.dataset.v = t.id;
    btn.addEventListener('click', () => setView(t.id));
    toggle.appendChild(btn);
  });

  function stayCard(b) {
    const rel = relDay(b.end);
    const card = e('div', { class: 'sched-card' + (b.sameDayTurnaround ? ' sched-card--turn' : '') }, [
      e('div', { class: 'sched-card-top' }, [
        e('span', { class: 'sched-prop sched-prop--' + (b.property === 'the-rockery' ? 'house' : 'cottage'), text: propShort(b.property) }),
        b.guest ? e('span', { class: 'sched-guest', text: b.guest }) : null,
        e('span', { class: 'sched-nights', text: b.nights + ' night' + (b.nights === 1 ? '' : 's') }),
      ]),
      e('div', { class: 'sched-legs' }, [
        e('div', { class: 'sched-leg' }, [
          e('span', { class: 'sched-leg-k', text: 'Arrive' }),
          e('span', { class: 'sched-leg-v', text: fmtDate(b.start) }),
          e('span', { class: 'sched-leg-note', text: 'ready by 3pm' }),
        ]),
        e('div', { class: 'sched-leg sched-leg--clean' }, [
          e('span', { class: 'sched-leg-k', text: 'Depart · clean' }),
          e('span', { class: 'sched-leg-v', text: fmtDate(b.end) }),
          e('span', { class: 'sched-leg-note', text: b.sameDayTurnaround ? 'clean 10am → ready 3pm (same-day)' : 'clean from 10am' }),
        ]),
      ]),
    ]);
    if (b.sameDayTurnaround) {
      card.querySelector('.sched-card-top').appendChild(e('span', { class: 'sched-badge', text: 'Same-day turnaround' }));
    } else if (rel) {
      card.querySelector('.sched-card-top').appendChild(e('span', { class: 'sched-badge sched-badge--soon', text: 'Clean ' + rel.toLowerCase() }));
    }
    return card;
  }

  function render() {
    listWrap.textContent = '';
    const rows = all.filter((b) => view === 'all' || b.property === view);

    if (!rows.length) {
      listWrap.appendChild(e('div', { class: 'sched-empty' }, [
        e('p', { text: 'No upcoming bookings to show.' }),
        e('p', { class: 'sched-muted', text: 'This page updates automatically as new bookings come in.' }),
      ]));
      return;
    }

    // Next clean highlight — soonest departure from today onward.
    const upcoming = rows.filter((b) => daysUntil(b.end) >= 0).sort((a, b) => a.end.localeCompare(b.end));
    if (upcoming.length) {
      const nx = upcoming[0];
      const rel = relDay(nx.end);
      listWrap.appendChild(e('div', { class: 'sched-next' }, [
        e('div', { class: 'sched-next-label', text: 'Next clean' }),
        e('div', { class: 'sched-next-date' }, [
          fmtDate(nx.end),
          rel ? e('span', { class: 'sched-next-rel', text: ' · ' + rel }) : null,
        ]),
        e('div', { class: 'sched-next-sub', text: propLabel(nx.property) + (nx.sameDayTurnaround ? ' — same-day turnaround, ready by 3pm' : ' — clean any time from 10am') }),
      ]));
    }

    // Group the stays by month of check-in.
    let currentMonth = '';
    rows.forEach((b) => {
      const mk = monthKey(b.start);
      if (mk !== currentMonth) {
        currentMonth = mk;
        listWrap.appendChild(e('div', { class: 'sched-month', text: monthLabel(mk) }));
      }
      listWrap.appendChild(stayCard(b));
    });
  }

  root.textContent = '';
  root.appendChild(toggle);
  root.appendChild(listWrap);

  if (data.generatedAt) {
    const dt = new Date(data.generatedAt);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    root.appendChild(e('p', { class: 'sched-updated', text: 'Updated ' + hh + ':' + mm + ' · refresh the page for the latest.' }));
  }

  render();
}
