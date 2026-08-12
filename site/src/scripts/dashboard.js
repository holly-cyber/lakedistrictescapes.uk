// Owner management dashboard — analytics + hand-rolled SVG charts (no external
// libraries). Given { properties, bookings, expenses } it builds KPI cards,
// income-vs-expenditure and occupancy charts, a tax-year summary and tables,
// with a Combined / House / Cottage view toggle.

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------- small DOM + format helpers ----------
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
function s(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}
function money(n, short) {
  const neg = n < 0;
  const v = Math.abs(n);
  let out;
  if (short) {
    if (v >= 1000) out = '£' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
    else out = '£' + Math.round(v);
  } else {
    out = '£' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return neg ? '−' + out : out;
}
function pct(n) {
  return (Math.round(n * 10) / 10).toLocaleString('en-GB') + '%';
}
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// ---------- date helpers (UTC to avoid timezone drift) ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthKey(iso) {
  return iso.slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MONTHS[m - 1] + " '" + String(y).slice(2);
}
function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function addMonth(key) {
  let [y, m] = key.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return y + '-' + String(m).padStart(2, '0');
}
function monthsBetween(minKey, maxKey) {
  const out = [];
  let k = minKey;
  let guard = 0;
  while (k <= maxKey && guard < 240) {
    out.push(k);
    k = addMonth(k);
    guard++;
  }
  return out;
}
function eachNight(startIso, endIso, fn) {
  let d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d < end) {
    fn(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
}

// ---------- analytics ----------
function computeView(data, view) {
  const { properties, bookings, expenses } = data;
  const inView = (b) => view === 'all' || b.property === view;
  const bk = bookings.filter(inView);

  // Expenses: combined counts everything in full; a single-property view counts
  // that property's own expenses in full and 'shared' ones apportioned 50/50.
  const exp = expenses
    .filter((x) => view === 'all' || x.property === view || x.property === 'shared')
    .map((x) => {
      const share = view !== 'all' && x.property === 'shared' ? 0.5 : 1;
      return { ...x, alloc: x.amount * share, allocVat: x.vat * share };
    });

  const grossIncome = bk.reduce((a, b) => a + b.gross, 0);
  const fees = bk.reduce((a, b) => a + b.fee, 0);
  const cleaning = bk.reduce((a, b) => a + (b.cleaning || 0), 0);
  const netPayout = bk.reduce((a, b) => a + b.net, 0);
  const expensesTotal = exp.reduce((a, x) => a + x.alloc, 0);
  const vatReclaim = exp.reduce((a, x) => a + x.allocVat, 0);
  const netProfit = grossIncome - fees - expensesTotal;
  const nights = bk.reduce((a, b) => a + b.nights, 0);
  const avgNightly = nights ? grossIncome / nights : 0;

  // Monthly buckets.
  const incomeByMonth = {};
  const expenseByMonth = {};
  const bookedNightsByMonth = {};
  bk.forEach((b) => {
    incomeByMonth[monthKey(b.start)] = (incomeByMonth[monthKey(b.start)] || 0) + b.gross;
    eachNight(b.start, b.end, (iso) => {
      const k = monthKey(iso);
      bookedNightsByMonth[k] = (bookedNightsByMonth[k] || 0) + 1;
    });
  });
  exp.forEach((x) => {
    expenseByMonth[monthKey(x.date)] = (expenseByMonth[monthKey(x.date)] || 0) + x.alloc;
  });

  // Available nights per month for the live properties in this view.
  const propsInView = view === 'all' ? Object.keys(properties) : [view];
  function availableNights(key) {
    let total = 0;
    for (const pk of propsInView) {
      const lf = properties[pk] && properties[pk].liveFrom;
      if (!lf) continue;
      const lfKey = lf.slice(0, 7);
      if (key < lfKey) continue;
      const dim = daysInMonth(key);
      if (key === lfKey) total += dim - (Number(lf.slice(8, 10)) - 1);
      else total += dim;
    }
    return total;
  }

  // Month range across income, expenses and booked nights.
  const keys = new Set([
    ...Object.keys(incomeByMonth),
    ...Object.keys(expenseByMonth),
    ...Object.keys(bookedNightsByMonth),
  ]);
  let monthly = [];
  let occTotalBooked = 0;
  let occTotalAvail = 0;
  if (keys.size) {
    const sorted = [...keys].sort();
    const months = monthsBetween(sorted[0], sorted[sorted.length - 1]);
    monthly = months.map((k) => {
      const avail = availableNights(k);
      const booked = bookedNightsByMonth[k] || 0;
      occTotalBooked += booked;
      occTotalAvail += avail;
      return {
        key: k,
        label: monthLabel(k),
        income: incomeByMonth[k] || 0,
        expense: expenseByMonth[k] || 0,
        occ: avail ? (booked / avail) * 100 : 0,
        booked,
        avail,
      };
    });
  }
  const occupancy = occTotalAvail ? (occTotalBooked / occTotalAvail) * 100 : 0;

  return {
    grossIncome, fees, cleaning, netPayout, expensesTotal, vatReclaim, netProfit,
    nights, avgNightly, occupancy, monthly,
    bookings: bk.slice().sort((a, b) => a.start.localeCompare(b.start)),
    expenses: exp.slice().sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------- chart builders ----------
function groupedBarChart(series) {
  const height = 240, padL = 46, padR = 14, padT = 14, padB = 38;
  const groupW = 54, gap = 22;
  const n = Math.max(series.length, 1);
  const width = padL + padR + n * groupW + (n - 1) * gap;
  const chartH = height - padT - padB;
  const max = niceMax(Math.max(1, ...series.flatMap((d) => [d.income, d.expense])));
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Income versus expenditure by month' });

  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = padT + chartH * (1 - f);
    svg.appendChild(s('line', { x1: padL, y1: y, x2: width - padR, y2: y, class: 'chart-grid' }));
    svg.appendChild(s('text', { x: padL - 8, y: y + 3.5, class: 'chart-yl', 'text-anchor': 'end' }, money(max * f, true)));
  });

  series.forEach((d, i) => {
    const gx = padL + i * (groupW + gap);
    const half = (groupW - 8) / 2;
    const ih = chartH * (d.income / max);
    const eh = chartH * (d.expense / max);
    const rIncome = s('rect', { x: gx, y: padT + chartH - ih, width: half, height: Math.max(ih, 0), rx: 2.5, class: 'bar-income' });
    rIncome.appendChild(s('title', {}, `${d.label} · income ${money(d.income)}`));
    svg.appendChild(rIncome);
    const rExp = s('rect', { x: gx + half + 8, y: padT + chartH - eh, width: half, height: Math.max(eh, 0), rx: 2.5, class: 'bar-expense' });
    rExp.appendChild(s('title', {}, `${d.label} · expenses ${money(d.expense)}`));
    svg.appendChild(rExp);
    svg.appendChild(s('text', { x: gx + groupW / 2, y: height - padB + 18, class: 'chart-xl', 'text-anchor': 'middle' }, d.label));
  });
  return svg;
}

function occupancyChart(series) {
  const height = 210, padL = 40, padR = 14, padT = 14, padB = 38;
  const groupW = 46, gap = 26;
  const n = Math.max(series.length, 1);
  const width = padL + padR + n * groupW + (n - 1) * gap;
  const chartH = height - padT - padB;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Occupancy rate by month' });

  [0, 0.5, 1].forEach((f) => {
    const y = padT + chartH * (1 - f);
    svg.appendChild(s('line', { x1: padL, y1: y, x2: width - padR, y2: y, class: 'chart-grid' }));
    svg.appendChild(s('text', { x: padL - 8, y: y + 3.5, class: 'chart-yl', 'text-anchor': 'end' }, Math.round(100 * f) + '%'));
  });
  series.forEach((d, i) => {
    const gx = padL + i * (groupW + gap);
    const h = chartH * (Math.min(d.occ, 100) / 100);
    const rect = s('rect', { x: gx, y: padT + chartH - h, width: groupW, height: Math.max(h, 0), rx: 2.5, class: 'bar-occ' });
    rect.appendChild(s('title', {}, `${d.label} · ${pct(d.occ)} (${d.booked}/${d.avail} nights)`));
    svg.appendChild(rect);
    svg.appendChild(s('text', { x: gx + groupW / 2, y: padT + chartH - h - 5, class: 'chart-val', 'text-anchor': 'middle' }, d.occ >= 1 ? Math.round(d.occ) + '%' : ''));
    svg.appendChild(s('text', { x: gx + groupW / 2, y: height - padB + 18, class: 'chart-xl', 'text-anchor': 'middle' }, d.label));
  });
  return svg;
}

// ---------- UI pieces ----------
function kpi(label, value, sub, accent) {
  return e('div', { class: 'kpi' + (accent ? ' kpi--' + accent : '') }, [
    e('div', { class: 'kpi-num', text: value }),
    e('div', { class: 'kpi-label', text: label }),
    sub ? e('div', { class: 'kpi-sub', text: sub }) : null,
  ]);
}
function card(title, subtitle, body, extraHead) {
  return e('div', { class: 'dash-card' }, [
    e('div', { class: 'dash-card-h' }, [
      e('div', {}, [e('h3', { text: title }), subtitle ? e('p', { class: 'dash-card-sub', text: subtitle }) : null]),
      extraHead || null,
    ]),
    body,
  ]);
}
function legend(items) {
  return e('div', { class: 'chart-legend' }, items.map((it) =>
    e('span', { class: 'lg' }, [e('span', { class: 'lg-dot ' + it.cls }), it.label])
  ));
}
function scroller(node) {
  return e('div', { class: 'chart-scroll' }, node);
}

function bookingsTable(bookings, properties) {
  if (!bookings.length) return null;
  const head = e('tr', {}, ['Check-in', 'Nights', 'Guest', 'Property', 'Gross', 'Fee', 'Net'].map((h) => e('th', { text: h })));
  const rows = bookings.map((b) =>
    e('tr', {}, [
      e('td', { text: b.start }),
      e('td', { text: String(b.nights) }),
      e('td', { text: b.guest }),
      e('td', { text: (properties[b.property] || {}).short || b.property }),
      e('td', { class: 'num', text: money(b.gross) }),
      e('td', { class: 'num muted', text: money(b.fee) }),
      e('td', { class: 'num', text: money(b.net) }),
    ])
  );
  return card('Bookings', bookings.length + ' reservation' + (bookings.length === 1 ? '' : 's'),
    scroller(e('table', { class: 'dash-table' }, [e('thead', {}, head), e('tbody', {}, rows)])));
}

function expensesTable(expenses, properties) {
  if (!expenses.length) return null;
  const head = e('tr', {}, ['Date', 'Vendor', 'Category', 'Property', 'Amount', 'VAT'].map((h) => e('th', { text: h })));
  const rows = expenses.map((x) =>
    e('tr', {}, [
      e('td', { text: x.date }),
      e('td', { text: x.vendor }),
      e('td', { text: x.category }),
      e('td', { text: x.property === 'shared' ? 'Shared' : (properties[x.property] || {}).short || x.property }),
      e('td', { class: 'num', text: money(x.alloc) }),
      e('td', { class: 'num muted', text: x.allocVat ? money(x.allocVat) : '—' }),
    ])
  );
  return card('Expenses', expenses.length + ' item' + (expenses.length === 1 ? '' : 's'),
    scroller(e('table', { class: 'dash-table' }, [e('thead', {}, head), e('tbody', {}, rows)])));
}

function taxSummary(v) {
  const rows = [
    ['Rental income (turnover)', money(v.grossIncome), false],
    ['Less: channel / booking fees', '− ' + money(v.fees), true],
    ['Less: running expenses', '− ' + money(v.expensesTotal), true],
    ['Taxable profit', money(v.netProfit), false, true],
    ['Cash received (net payouts)', money(v.netPayout), false],
    ['VAT within expenses (reclaimable if registered)', money(v.vatReclaim), false],
  ];
  const body = e('div', { class: 'tax-rows' }, rows.map((r) =>
    e('div', { class: 'tax-row' + (r[3] ? ' tax-row--total' : '') }, [
      e('span', { class: 'tax-k', text: r[0] }),
      e('span', { class: 'tax-v' + (r[2] ? ' neg' : ''), text: r[1] }),
    ])
  ));
  return card('Tax summary', "2026/27 tax year · 6 Apr 2026 – 5 Apr 2027", body);
}

// ---------- main ----------
export function initDashboard(root, data) {
  const { properties } = data;
  let view = 'all';

  const toggle = e('div', { class: 'dash-toggle', role: 'tablist' });
  const views = [
    { id: 'all', label: 'Combined' },
    { id: 'the-rockery', label: (properties['the-rockery'] || {}).name || 'The Rockery' },
    { id: 'primrose-cottage', label: (properties['primrose-cottage'] || {}).name || 'Primrose Cottage' },
  ];
  const body = e('div', { class: 'dash-body' });

  function setView(id) {
    view = id;
    [...toggle.children].forEach((b) => b.classList.toggle('active', b.dataset.v === id));
    render();
  }
  views.forEach((vw, i) => {
    const btn = e('button', { class: 'dash-tgl' + (i === 0 ? ' active' : ''), type: 'button', text: vw.label });
    btn.dataset.v = vw.id;
    btn.addEventListener('click', () => setView(vw.id));
    toggle.appendChild(btn);
  });

  function render() {
    const v = computeView(data, view);
    body.textContent = '';

    if (!v.bookings.length && !v.expenses.length) {
      body.appendChild(e('div', { class: 'dash-empty' }, [
        e('p', { text: 'No bookings or expenses recorded yet for ' + (view === 'the-rockery' ? 'The Rockery' : 'this property') + '.' }),
        e('p', { class: 'muted', text: 'The Rockery isn’t taking bookings yet — its figures will appear here once it launches.' }),
      ]));
      return;
    }

    // KPI row
    body.appendChild(e('div', { class: 'dash-kpis' }, [
      kpi('Rental income', money(v.grossIncome), 'gross, before fees'),
      kpi('Channel fees', money(v.fees), 'Airbnb service fees'),
      kpi('Expenses', money(v.expensesTotal), v.vatReclaim ? money(v.vatReclaim) + ' VAT' : 'running costs'),
      kpi('Net profit', money(v.netProfit), 'income − fees − costs', v.netProfit >= 0 ? 'pos' : 'neg'),
      kpi('Occupancy', pct(v.occupancy), 'nights booked / available'),
      kpi('Nights booked', String(v.nights), v.bookings.length + ' bookings'),
      kpi('Avg. nightly', money(v.avgNightly), 'per night booked'),
      kpi('Net payout', money(v.netPayout), 'cash received'),
    ]));

    // Charts
    if (v.monthly.length) {
      body.appendChild(card('Income vs expenditure', 'by month, ' + views.find((x) => x.id === view).label.toLowerCase(),
        e('div', {}, [scroller(groupedBarChart(v.monthly))]),
        legend([{ cls: 'lg-income', label: 'Income' }, { cls: 'lg-expense', label: 'Expenses' }])));
      body.appendChild(card('Occupancy by month', 'nights booked vs available', scroller(occupancyChart(v.monthly))));
    }

    // Tax + tables
    body.appendChild(taxSummary(v));
    const bt = bookingsTable(v.bookings, properties);
    if (bt) body.appendChild(bt);
    const et = expensesTable(v.expenses, properties);
    if (et) body.appendChild(et);
  }

  root.textContent = '';
  root.appendChild(toggle);

  if (data.meta) {
    const live = data.meta.source === 'airtable';
    const meta = e('div', { class: 'dash-meta' }, [
      e('span', { class: 'dash-dot' + (live ? ' live' : '') }),
      (live ? 'Live from Airtable' : 'Built-in sample data') +
        ' · ' + (data.bookings || []).length + ' bookings, ' + (data.expenses || []).length + ' expenses',
    ]);
    if (data.meta.warning) meta.appendChild(e('span', { class: 'dash-warn', text: ' — ' + data.meta.warning }));
    root.appendChild(meta);
  }

  root.appendChild(body);
  render();
}
