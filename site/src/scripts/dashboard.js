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

  // Expenses: only the business-use % of each receipt is claimable. Combined
  // counts everything in full; a single-property view counts that property's
  // own expenses in full and 'shared' ones apportioned 50/50.
  const exp = expenses
    .filter((x) => view === 'all' || x.property === view || x.property === 'shared')
    .map((x) => {
      const pctFrac = (x.businessPct == null ? 100 : x.businessPct) / 100;
      const share = view !== 'all' && x.property === 'shared' ? 0.5 : 1;
      const claimed = x.amount * pctFrac; // business portion of the full bill
      return {
        ...x,
        businessPct: x.businessPct == null ? 100 : x.businessPct,
        claimed,
        alloc: claimed * share,
        allocVat: (x.vat || 0) * pctFrac * share,
      };
    });

  const grossIncome = bk.reduce((a, b) => a + b.gross, 0);
  const fees = bk.reduce((a, b) => a + b.fee, 0);
  const cleaning = bk.reduce((a, b) => a + (b.cleaning || 0), 0);
  const netPayout = bk.reduce((a, b) => a + b.net, 0);
  const expensesTotal = exp.reduce((a, x) => a + x.alloc, 0);
  const startupTotal = exp.reduce((a, x) => a + (x.startup ? x.alloc : 0), 0);
  const vatReclaim = exp.reduce((a, x) => a + x.allocVat, 0);
  const netProfit = grossIncome - fees - expensesTotal;
  // "Ongoing" profit strips out one-off start-up costs (still tax-deductible,
  // but not part of day-to-day running economics).
  const ongoingProfit = netProfit + startupTotal;
  const nights = bk.reduce((a, b) => a + b.nights, 0);
  const avgNightly = nights ? grossIncome / nights : 0;
  const avgProfitNight = nights ? netProfit / nights : 0;
  const ongoingProfitNight = nights ? ongoingProfit / nights : 0;

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
    grossIncome, fees, cleaning, netPayout, expensesTotal, startupTotal, vatReclaim, netProfit,
    ongoingProfit, nights, avgNightly, avgProfitNight, ongoingProfitNight, occupancy, monthly,
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

// A small coloured pill showing a direct (Stripe) booking's payment status.
function directStatusPill(b) {
  if (b.source !== 'direct' || !b.status) return null;
  const map = {
    deposit_paid: ['bk-status--deposit', 'Deposit paid'],
    balance_scheduled: ['bk-status--scheduled', 'Charging balance'],
    paid: ['bk-status--paid', 'Paid in full'],
    balance_failed: ['bk-status--failed', 'Balance failed'],
  };
  const m = map[b.status];
  if (!m) return null;
  let title = '';
  if (b.status === 'deposit_paid' && b.balanceDueDate) title = 'Balance of ' + money(b.balance) + ' auto-charges ' + b.balanceDueDate;
  else if (b.status === 'balance_failed' && b.balanceError) title = b.balanceError;
  return e('span', { class: 'bk-status ' + m[0], title }, m[1]);
}

// Calendar-sync helper: direct/manual bookings block our own site + the cleaner
// schedule instantly, but they are NOT pushed to Airbnb automatically. This card
// gives the owner the iCal URL to IMPORT into each Airbnb listing so Airbnb
// blocks those nights too, preventing a double-booking from the Airbnb side.
// Owner pricing editor — base nightly rate, minimum stay, fees, and
// length-of-stay rates (e.g. a lower per-night rate for 3+ nights or a week).
function pricingSection(pricing, properties, onSave) {
  if (!pricing || !Object.keys(pricing).length) return null;
  const wrap = e('div', { class: 'price-wrap' });

  Object.keys(pricing).forEach((key) => {
    const p = pricing[key];
    if (!p) return;
    const name = (properties[key] && properties[key].name) || key;
    const inputs = {};
    const field = (label, fname, val, step) => {
      const inp = e('input', { class: 'price-in', type: 'number', min: '0', step: step || '1', value: val == null ? '' : String(val) });
      inputs[fname] = inp;
      return e('label', { class: 'price-field' }, [e('span', { text: label }), inp]);
    };

    const tiersWrap = e('div', { class: 'price-tiers' });
    const tierRows = [];
    function addTierRow(t) {
      const minIn = e('input', { class: 'price-in price-in-sm', type: 'number', min: '2', step: '1', value: t ? String(t.minNights) : '', placeholder: 'nights' });
      const rateIn = e('input', { class: 'price-in price-in-sm', type: 'number', min: '0', step: '0.01', value: t ? String(t.nightly) : '', placeholder: '£' });
      const hint = e('span', { class: 'price-tier-hint' });
      const upd = () => {
        const n = Number(minIn.value), r = Number(rateIn.value);
        hint.textContent = n > 0 && r > 0 ? '= ' + money(n * r) + (n === 7 ? ' / week' : '') : '';
      };
      minIn.addEventListener('input', upd);
      rateIn.addEventListener('input', upd);
      const del = e('button', { class: 'price-tier-del', type: 'button', title: 'Remove', 'aria-label': 'Remove rate' }, '×');
      const rec = { minIn, rateIn };
      const row = e('div', { class: 'price-tier-row' }, [
        e('span', { class: 'price-tier-lbl', text: 'From' }), minIn,
        e('span', { class: 'price-tier-lbl', text: 'nights →' }), rateIn,
        e('span', { class: 'price-tier-lbl', text: '/night' }), hint, del,
      ]);
      tierRows.push(rec);
      del.addEventListener('click', () => { const i = tierRows.indexOf(rec); if (i >= 0) tierRows.splice(i, 1); row.remove(); });
      tiersWrap.appendChild(row);
      upd();
    }
    (p.losTiers || []).forEach(addTierRow);
    const addBtn = e('button', { class: 'dash-linkbtn', type: 'button', text: '+ Add a length-of-stay rate' });
    addBtn.addEventListener('click', () => addTierRow());

    // Seasonal date-range rates.
    const seasonsWrap = e('div', { class: 'price-tiers' });
    const seasonRows = [];
    function addSeasonRow(s) {
      const nameIn = e('input', { class: 'price-in price-in-md', type: 'text', maxlength: '60', value: s ? s.name || '' : '', placeholder: 'e.g. Peak summer' });
      const startIn = e('input', { class: 'price-in price-in-sm', type: 'date', value: s ? s.start : '' });
      const endIn = e('input', { class: 'price-in price-in-sm', type: 'date', value: s ? s.end : '' });
      const rateIn = e('input', { class: 'price-in price-in-sm', type: 'number', min: '0', step: '0.01', value: s ? String(s.nightly) : '', placeholder: '£' });
      const del = e('button', { class: 'price-tier-del', type: 'button', title: 'Remove', 'aria-label': 'Remove season' }, '×');
      const rec = { nameIn, startIn, endIn, rateIn };
      const row = e('div', { class: 'price-season-row' }, [
        nameIn,
        e('span', { class: 'price-tier-lbl', text: '' }), startIn,
        e('span', { class: 'price-tier-lbl', text: '→' }), endIn,
        e('span', { class: 'price-tier-lbl', text: '£' }), rateIn,
        e('span', { class: 'price-tier-lbl', text: '/night' }), del,
      ]);
      seasonRows.push(rec);
      del.addEventListener('click', () => { const i = seasonRows.indexOf(rec); if (i >= 0) seasonRows.splice(i, 1); row.remove(); });
      seasonsWrap.appendChild(row);
    }
    (p.seasons || []).forEach(addSeasonRow);
    const addSeasonBtn = e('button', { class: 'dash-linkbtn', type: 'button', text: '+ Add a seasonal rate' });
    addSeasonBtn.addEventListener('click', () => addSeasonRow());

    // Dynamic (rule-based) pricing controls + external-feed status.
    const d = p.dynamic || {};
    const lt = {};
    (d.leadTime || []).forEach((t) => { lt[t.withinDays] = t.pct; });
    const dinp = (val, step) => e('input', { class: 'price-in price-in-sm', type: 'number', step: step || '1', value: val == null || val === '' ? '' : String(val) });
    const dynEnabled = e('input', { type: 'checkbox' });
    if (d.enabled) dynEnabled.checked = true;
    const weekendPct = dinp(d.weekendPct || '', '1');
    const lm7 = dinp(lt[7] != null ? lt[7] : '', '1');
    const lm14 = dinp(lt[14] != null ? lt[14] : '', '1');
    const floorIn = dinp(d.floor != null ? d.floor : '', '0.01');
    const ceilIn = dinp(d.ceiling != null ? d.ceiling : '', '0.01');
    const feed = p._feed;
    const feedLine = feed
      ? 'External market feed: ' + feed.source + ' — ' + feed.count + ' dates, updated ' + String(feed.updatedAt).slice(0, 10) + '.'
      : 'External market feed: none connected (in-house rules only). Ready to plug in later.';
    const dynBlock = e('div', { class: 'price-dyn' }, [
      e('div', { class: 'price-tiers-head', text: 'Dynamic pricing (rules)' }),
      e('label', { class: 'price-dyn-toggle' }, [dynEnabled, e('span', { text: ' Enable dynamic pricing rules' })]),
      e('div', { class: 'price-grid' }, [
        e('label', { class: 'price-field' }, [e('span', { text: 'Weekend uplift % (Fri/Sat)' }), weekendPct]),
        e('label', { class: 'price-field' }, [e('span', { text: 'Last-minute: within 7 days %' }), lm7]),
        e('label', { class: 'price-field' }, [e('span', { text: 'Last-minute: within 14 days %' }), lm14]),
        e('label', { class: 'price-field' }, [e('span', { text: 'Price floor (£/night)' }), floorIn]),
        e('label', { class: 'price-field' }, [e('span', { text: 'Price ceiling (£/night)' }), ceilIn]),
      ]),
      e('p', { class: 'price-note', text: 'Rules apply on top of your base / seasonal / length-of-stay rates. Use a negative % for discounts (e.g. -15 for last-minute). Floor & ceiling keep prices within safe bounds.' }),
      e('p', { class: 'price-feed', text: feedLine }),
    ]);

    const status = e('p', { class: 'price-status' });
    const saveBtn = e('button', { class: 'mb-btn', type: 'button', text: 'Save prices' });
    saveBtn.addEventListener('click', async () => {
      const payload = {
        nightly: inputs.nightly.value,
        minNights: inputs.minNights.value,
        cleaningFee: inputs.cleaningFee.value,
        depositPct: inputs.depositPct.value,
        balanceDueDays: inputs.balanceDueDays.value,
        maxGuests: inputs.maxGuests.value,
        maxInfants: inputs.maxInfants.value,
        maxDogs: inputs.maxDogs.value,
        losTiers: tierRows.map((r) => ({ minNights: r.minIn.value, nightly: r.rateIn.value })).filter((t) => t.minNights && t.nightly),
        seasons: seasonRows
          .map((r) => ({ name: r.nameIn.value, start: r.startIn.value, end: r.endIn.value, nightly: r.rateIn.value }))
          .filter((s) => s.start && s.end && s.nightly),
        dynamic: {
          enabled: dynEnabled.checked,
          weekendPct: weekendPct.value,
          leadTime: [
            { withinDays: 7, pct: lm7.value },
            { withinDays: 14, pct: lm14.value },
          ].filter((t) => t.pct !== '' && Number(t.pct) !== 0),
          floor: floorIn.value,
          ceiling: ceilIn.value,
        },
      };
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      status.textContent = '';
      try {
        await onSave(key, payload);
        status.textContent = 'Saved ✓';
        status.className = 'price-status ok';
      } catch (err) {
        status.textContent = err.message || 'Could not save.';
        status.className = 'price-status err';
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save prices';
    });

    const cardBody = e('div', { class: 'price-body' }, [
      e('div', { class: 'price-grid' }, [
        field('Nightly rate (£)', 'nightly', p.nightly, '0.01'),
        field('Minimum nights', 'minNights', p.minNights),
        field('Cleaning fee (£)', 'cleaningFee', p.cleaningFee || 0, '0.01'),
        field('Deposit %', 'depositPct', p.depositPct),
        field('Balance due (days before)', 'balanceDueDays', p.balanceDueDays),
        field('Max guests', 'maxGuests', p.maxGuests),
        field('Max under-2s', 'maxInfants', p.maxInfants || 0),
        field('Max dogs', 'maxDogs', p.maxDogs || 0),
      ]),
      e('p', { class: 'price-note', text: 'The nightly rate applies to your shortest stay (the minimum nights above). Add rates below for longer stays — e.g. a lower per-night rate from 3 nights, and a weekly rate from 7 nights.' }),
      e('div', { class: 'price-tiers-head', text: 'Length-of-stay rates' }),
      tiersWrap,
      addBtn,
      e('div', { class: 'price-tiers-head', text: 'Seasonal rates (peak / off-peak dates)' }),
      e('p', { class: 'price-note', text: 'Set a per-night rate for specific date ranges (e.g. peak summer, Christmas). Seasonal rates override the standard/length-of-stay rate for nights that fall within them.' }),
      seasonsWrap,
      addSeasonBtn,
      dynBlock,
      e('div', { class: 'price-actions' }, [saveBtn, status]),
    ]);
    wrap.appendChild(card('Pricing — ' + name, p.bookable ? 'live for direct booking' : 'not open for direct booking yet', cardBody));
  });
  return wrap;
}

function syncNote(properties) {
  const origin = 'https://lakedistrictescapes.uk';
  const rows = Object.keys(properties).map((key) => {
    const urlStr = origin + '/api/calendar/' + key + '.ics';
    const input = e('input', { class: 'sync-url', type: 'text', readonly: 'readonly', value: urlStr, 'aria-label': properties[key].name + ' calendar URL' });
    const copy = e('button', { class: 'dash-linkbtn sync-copy', type: 'button', text: 'Copy' });
    copy.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(urlStr);
        else { input.select(); document.execCommand('copy'); }
        copy.textContent = 'Copied ✓';
      } catch {
        input.select();
        copy.textContent = 'Select & copy';
      }
      setTimeout(() => { copy.textContent = 'Copy'; }, 2200);
    });
    return e('div', { class: 'sync-row' }, [
      e('span', { class: 'sync-prop', text: properties[key].name }),
      input,
      copy,
    ]);
  });

  const body = e('div', { class: 'sync-note' }, [
    e('p', { class: 'sync-lead', text: 'Direct bookings block your own site and the cleaner schedule straight away — but Airbnb won’t know about them unless you import the calendar below. Add each URL to the matching Airbnb listing so Airbnb blocks those dates too.' }),
    ...rows,
    e('p', { class: 'sync-steps muted', text: 'In Airbnb: Listing → Availability → Connect calendars → Import calendar → paste the URL. Airbnb refreshes it every few hours. Direct-booking availability already checks your Airbnb calendar the other way, so this closes the loop.' }),
  ]);
  return card('Block Airbnb for direct bookings', 'one-time setup per listing', body);
}

function bookingsTable(bookings, properties, handlers, headExtra) {
  if (!bookings.length) return null;
  const head = e('tr', {}, ['Check-in', 'Nights', 'Guest', 'Property', 'Channel', 'Gross', 'Fee', 'Net', ''].map((h) => e('th', { text: h })));
  const rows = bookings.map((b) => {
    let delCell;
    if (b.source === 'owner') {
      const del = e('button', { class: 'dash-del', type: 'button', title: 'Delete this booking', 'aria-label': 'Delete booking' }, '×');
      del.addEventListener('click', () => handlers.onDeleteBooking(b));
      delCell = e('td', {}, del);
    } else if (b.source === 'direct' && b.status === 'balance_failed' && handlers.onRetryBalance) {
      const retry = e('button', { class: 'bk-retry', type: 'button', title: b.balanceError || 'Retry the balance charge' }, 'Retry balance');
      retry.addEventListener('click', () => handlers.onRetryBalance(b, retry));
      delCell = e('td', {}, retry);
    } else {
      delCell = e('td', {});
    }
    const channelCell = b.source === 'direct'
      ? e('td', {}, [e('span', { class: 'chan-badge chan-badge--direct', text: 'Direct' }), directStatusPill(b)])
      : e('td', { class: 'muted' }, [b.channel || 'Airbnb']);
    return e('tr', {}, [
      e('td', { text: b.start }),
      e('td', { text: String(b.nights) }),
      e('td', { text: b.guest || '—' }),
      e('td', { text: propLabel(b.property, properties) }),
      channelCell,
      e('td', { class: 'num', text: money(b.gross) }),
      e('td', { class: 'num muted', text: money(b.fee) }),
      e('td', { class: 'num', text: money(b.net) }),
      delCell,
    ]);
  });
  return card('Bookings', bookings.length + ' reservation' + (bookings.length === 1 ? '' : 's'),
    scroller(e('table', { class: 'dash-table' }, [e('thead', {}, head), e('tbody', {}, rows)])), headExtra);
}

function exportBookingsCsv(bookings, properties, viewLabel) {
  const header = ['Check-in', 'Check-out', 'Nights', 'Guest', 'Property', 'Channel', 'Gross', 'Fee', 'Cleaning', 'Net'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  bookings.forEach((b) => {
    lines.push([
      b.start, b.end, b.nights, b.guest || '', propLabel(b.property, properties), b.channel || 'Airbnb',
      b.gross.toFixed(2), (b.fee || 0).toFixed(2), (b.cleaning || 0).toFixed(2), b.net.toFixed(2),
    ].map(esc).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lde-bookings-' + viewLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- add-booking form ----------
function nightsBetweenIso(a, b) {
  if (!a || !b) return 0;
  const d = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

// ---------- CSV import (Airbnb reservations export) ----------
// Robust CSV parser — handles quoted fields, escaped "" quotes, embedded
// commas and newlines (the Airbnb "Listing" column spans lines).
function parseCsv(text) {
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function csvNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}
// Accepts MM/DD/YYYY (Airbnb) or an ISO date; returns YYYY-MM-DD or ''.
function csvDate(v) {
  const t = String(v || '').trim();
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (us) return us[3] + '-' + us[1].padStart(2, '0') + '-' + us[2].padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return '';
}
function propFromListing(listing) {
  return /rockery/i.test(listing || '') ? 'the-rockery' : 'primrose-cottage';
}

// Turn parsed CSV rows into booking objects. Understands the Airbnb export
// header; only imports "Reservation" rows with valid dates.
function mapAirbnbCsv(rows) {
  if (!rows.length) return { bookings: [], error: 'That file looks empty.' };
  const headers = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);
  const iType = idx('type');
  const iCode = idx('confirmation code');
  const iBooked = idx('booking date');
  const iStart = idx('start date');
  const iEnd = idx('end date');
  const iNights = idx('nights');
  const iGuest = idx('guest');
  const iListing = idx('listing');
  const iAmount = idx('amount');
  const iFee = idx('service fee');
  const iClean = idx('cleaning fee');
  const iGross = idx('gross earnings');
  const iDate = idx('date');
  if (iStart < 0 || iEnd < 0 || iGross < 0) {
    return { bookings: [], error: 'That doesn’t look like an Airbnb reservations CSV.' };
  }
  const get = (row, i) => (i >= 0 && i < row.length ? String(row[i]).trim() : '');
  const bookings = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (iType >= 0 && get(row, iType) && !/reservation/i.test(get(row, iType))) continue;
    const start = csvDate(get(row, iStart));
    const end = csvDate(get(row, iEnd));
    const gross = csvNum(get(row, iGross));
    if (!start || !end || !(gross > 0)) continue;
    bookings.push({
      property: propFromListing(get(row, iListing)),
      channel: 'Airbnb',
      code: get(row, iCode),
      guest: get(row, iGuest),
      booked: csvDate(get(row, iBooked)),
      start,
      end,
      nights: parseInt(get(row, iNights), 10) || 0,
      gross,
      fee: csvNum(get(row, iFee)),
      cleaning: csvNum(get(row, iClean)),
      net: csvNum(get(row, iAmount)),
      payout: csvDate(get(row, iDate)),
      currency: 'GBP',
    });
  }
  return { bookings };
}

function addBookingForm(properties, onAdd, onImport) {
  const details = e('details', { class: 'dash-card receipt-form' });
  details.appendChild(e('summary', { class: 'rf-summary' }, [
    e('span', { class: 'rf-plus', text: '＋' }),
    e('span', { text: 'Add a booking' }),
  ]));

  const form = e('form', { class: 'receipt-fields', novalidate: 'novalidate' });

  const propSel = e('select', { name: 'property', required: 'required' }, [
    e('option', { value: 'primrose-cottage', text: 'Primrose Cottage' }),
    e('option', { value: 'the-rockery', text: 'The Rockery' }),
  ]);
  const channelIn = e('input', { name: 'channel', type: 'text', value: 'Airbnb', placeholder: 'Airbnb, Direct…' });
  const guestIn = e('input', { name: 'guest', type: 'text', placeholder: 'Guest name' });
  const inIn = e('input', { name: 'start', type: 'date', required: 'required' });
  const outIn = e('input', { name: 'end', type: 'date', required: 'required' });
  const grossIn = e('input', { name: 'gross', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: 'required', placeholder: '0.00' });
  const feeIn = e('input', { name: 'fee', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00' });
  const cleanIn = e('input', { name: 'cleaning', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', value: '0' });

  const preview = e('p', { class: 'rf-preview' });
  function updatePreview() {
    const nights = nightsBetweenIso(inIn.value, outIn.value);
    const gross = parseFloat(grossIn.value) || 0;
    const net = gross - (parseFloat(feeIn.value) || 0) - (parseFloat(cleanIn.value) || 0);
    if (nights > 0 && gross > 0) {
      preview.textContent = nights + ' night' + (nights === 1 ? '' : 's') + ' · net payout ' + money(net);
      preview.style.display = '';
    } else if (inIn.value && outIn.value && nights < 1) {
      preview.textContent = 'Check-out must be after check-in.';
      preview.style.display = '';
    } else {
      preview.style.display = 'none';
    }
  }
  [inIn, outIn, grossIn, feeIn, cleanIn].forEach((n) => n.addEventListener('input', updatePreview));
  updatePreview();

  const grid = e('div', { class: 'rf-grid' }, [
    field('Property', propSel),
    field('Channel', channelIn),
    field('Guest name', guestIn),
    field('Check-in', inIn),
    field('Check-out', outIn),
    field('Gross earnings (£)', grossIn, 'Total the guest paid, before fees.'),
    field('Service fee (£)', feeIn, 'Airbnb / channel fee deducted.'),
    field('Cleaning fee (£)', cleanIn),
  ]);

  const status = e('p', { class: 'rf-status', role: 'status', 'aria-live': 'polite' });
  const submit = e('button', { class: 'guest-btn rf-submit', type: 'submit', text: 'Save booking' });

  // CSV import block — upload an Airbnb reservations export to add them all.
  if (typeof onImport === 'function') {
    const csvIn = e('input', { type: 'file', accept: '.csv,text/csv', class: 'rf-csv' });
    const csvStatus = e('p', { class: 'rf-parsestatus' });
    csvIn.addEventListener('change', async () => {
      const file = csvIn.files && csvIn.files[0];
      if (!file) return;
      csvStatus.textContent = 'Reading your CSV…';
      csvStatus.className = 'rf-parsestatus busy';
      try {
        const text = await file.text();
        const { bookings, error } = mapAirbnbCsv(parseCsv(text));
        if (error || !bookings.length) {
          csvStatus.textContent = error || 'No bookings found in that file.';
          csvStatus.className = 'rf-parsestatus';
          csvIn.value = '';
          return;
        }
        const out = await onImport(bookings);
        const added = (out && out.addedCount) || 0;
        const skipped = (out && out.skipped) || 0;
        csvStatus.textContent = added
          ? 'Imported ' + added + ' booking' + (added === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' already recorded' : '') + '.'
          : 'All ' + skipped + ' booking' + (skipped === 1 ? '' : 's') + ' in that file were already recorded.';
        csvStatus.className = 'rf-parsestatus ok';
      } catch (err) {
        csvStatus.textContent = (err && err.message) || 'Sorry, that CSV could not be imported.';
        csvStatus.className = 'rf-parsestatus';
      } finally {
        csvIn.value = '';
      }
    });
    form.appendChild(e('div', { class: 'rf-import' }, [
      e('div', { class: 'rf-import-head' }, [
        e('strong', { text: 'Import from a CSV' }),
        e('span', { class: 'rf-hint', text: 'Upload your Airbnb reservations export (Hosting → Earnings → Get report) to add every booking at once. Ones already recorded are skipped.' }),
      ]),
      field('CSV file', csvIn),
      csvStatus,
    ]));
    form.appendChild(e('div', { class: 'rf-or' }, e('span', { text: 'or add one manually' })));
  }

  form.appendChild(grid);
  form.appendChild(preview);
  form.appendChild(e('div', { class: 'rf-actions' }, [submit, status]));
  details.appendChild(form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nights = nightsBetweenIso(inIn.value, outIn.value);
    const gross = parseFloat(grossIn.value);
    if (!inIn.value || !outIn.value) { status.textContent = 'Please choose check-in and check-out dates.'; status.className = 'rf-status err'; return; }
    if (nights < 1) { status.textContent = 'Check-out must be after check-in.'; status.className = 'rf-status err'; return; }
    if (!(gross > 0)) { status.textContent = 'Please enter the gross earnings.'; status.className = 'rf-status err'; return; }
    submit.disabled = true;
    submit.textContent = 'Saving…';
    status.textContent = '';
    status.className = 'rf-status';
    try {
      await onAdd({
        property: propSel.value,
        channel: channelIn.value,
        guest: guestIn.value,
        start: inIn.value,
        end: outIn.value,
        gross,
        fee: parseFloat(feeIn.value) || 0,
        cleaning: parseFloat(cleanIn.value) || 0,
      });
    } catch (err) {
      submit.disabled = false;
      submit.textContent = 'Save booking';
      status.textContent = err.message || 'Sorry, that could not be saved.';
      status.className = 'rf-status err';
    }
  });

  return details;
}

function propLabel(key, properties) {
  return key === 'shared' ? 'Shared' : (properties[key] || {}).short || key;
}

function expensesTable(expenses, properties, handlers, headExtra) {
  const cols = ['Date', 'Vendor', 'Category', 'Property', 'Amount', 'Biz %', 'Claimed', 'VAT', 'Receipt', ''];
  const head = e('tr', {}, cols.map((h) => e('th', { text: h })));
  const rows = expenses.map((x) => {
    // Receipt cell
    let receiptCell;
    if (x.receiptId) {
      const btn = e('button', { class: 'dash-linkbtn', type: 'button', text: 'View' });
      btn.addEventListener('click', () => handlers.onView(x));
      receiptCell = e('td', {}, btn);
    } else {
      receiptCell = e('td', { class: 'muted', text: '—' });
    }
    // Actions cell — edit + delete (owner-entered rows only)
    let delCell;
    if (x.source === 'owner') {
      const edit = e('button', { class: 'dash-linkbtn dash-edit', type: 'button', text: 'Edit' });
      edit.addEventListener('click', () => handlers.onEdit(x));
      const del = e('button', { class: 'dash-del', type: 'button', title: 'Delete this receipt', 'aria-label': 'Delete receipt' }, '×');
      del.addEventListener('click', () => handlers.onDelete(x));
      delCell = e('td', { class: 'row-actions' }, [edit, del]);
    } else {
      delCell = e('td', {});
    }
    return e('tr', {}, [
      e('td', { text: x.date }),
      e('td', { text: x.vendor || '—' }),
      e('td', {}, [
        x.category,
        x.startup ? e('span', { class: 'exp-startup-tag', text: 'start-up' }) : null,
      ]),
      e('td', { text: propLabel(x.property, properties) }),
      e('td', { class: 'num', text: money(x.amount) }),
      e('td', { class: 'num' + (x.businessPct < 100 ? ' biz' : ' muted'), text: Math.round(x.businessPct) + '%' }),
      e('td', { class: 'num', text: money(x.alloc) }),
      e('td', { class: 'num muted', text: x.allocVat ? money(x.allocVat) : '—' }),
      receiptCell,
      delCell,
    ]);
  });
  const body = expenses.length
    ? scroller(e('table', { class: 'dash-table' }, [e('thead', {}, head), e('tbody', {}, rows)]))
    : e('p', { class: 'dash-empty-sm muted', text: 'No expenses recorded yet — add your first receipt above.' });
  return card('Expenses', expenses.length + ' item' + (expenses.length === 1 ? '' : 's'), body, headExtra);
}

// ---------- add-receipt form ----------
const CATEGORIES = [
  'Utilities (electric / gas / water)',
  'Council tax / business rates',
  'Broadband & TV',
  'Cleaning',
  'Laundry',
  'Welcome Pack & Supplies',
  'Maintenance & Repairs',
  'Garden',
  'Furnishings & Equipment',
  'Insurance',
  'Toiletries & Consumables',
  'Marketing & Listing fees',
  'Accountancy & Professional',
  'Travel & Mileage',
  'Other',
];

function field(labelText, control, hint) {
  return e('label', { class: 'rf-field' }, [
    e('span', { class: 'rf-label', text: labelText }),
    control,
    hint ? e('span', { class: 'rf-hint', text: hint }) : null,
  ]);
}

let rfSeq = 0;
function readFileAsB64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const res = String(reader.result || '');
      const comma = res.indexOf(',');
      resolve({ data: comma >= 0 ? res.slice(comma + 1) : res, name: file.name, type: file.type || 'application/octet-stream' });
    };
    reader.readAsDataURL(file);
  });
}

// Builds the shared set of expense fields (used by both the add form and the
// edit dialog). `initial` pre-fills values; returns the field nodes plus
// `readPayload()` and `validate()` helpers so the caller drives submission.
function receiptFieldset(properties, initial = {}, fileOpts = {}) {
  const propSel = e('select', { name: 'property', required: 'required' }, [
    e('option', { value: 'primrose-cottage', text: 'Primrose Cottage' }),
    e('option', { value: 'the-rockery', text: 'The Rockery' }),
    e('option', { value: 'shared', text: 'Shared (both properties)' }),
  ]);
  if (initial.property) propSel.value = initial.property;

  const today = new Date().toISOString().slice(0, 10);
  const dateIn = e('input', { name: 'date', type: 'date', required: 'required', value: initial.date || today, max: today });
  const vendorIn = e('input', { name: 'vendor', type: 'text', placeholder: 'e.g. EDF Energy, Lidl, B&Q' });
  vendorIn.value = initial.vendor || '';

  const catId = 'rf-cats-' + ++rfSeq;
  const catList = e('datalist', { id: catId }, CATEGORIES.map((c) => e('option', { value: c })));
  const catIn = e('input', { name: 'category', type: 'text', list: catId, placeholder: 'Choose or type a category' });
  catIn.value = initial.category && initial.category !== 'Uncategorised' ? initial.category : '';

  const amountIn = e('input', { name: 'amount', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: 'required', placeholder: '0.00' });
  if (initial.amount != null) amountIn.value = String(initial.amount);
  const pctIn = e('input', { name: 'businessPct', type: 'number', step: '1', min: '0', max: '100', inputmode: 'numeric', value: initial.businessPct != null ? String(initial.businessPct) : '100' });
  const vatIn = e('input', { name: 'vat', type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00' });
  if (initial.vat) vatIn.value = String(initial.vat);
  const methodIn = e('input', { name: 'method', type: 'text', placeholder: 'Card, Bank transfer, Cash…' });
  methodIn.value = initial.method || '';
  const noteIn = e('input', { name: 'note', type: 'text', placeholder: 'Optional note' });
  noteIn.value = initial.note || '';
  const startupIn = e('input', { name: 'startup', type: 'checkbox' });
  if (initial.startup) startupIn.checked = true;
  const fileIn = e('input', { name: 'receipt', type: 'file', accept: 'image/*,application/pdf,.pdf,.heic' });

  // Live "claimed" preview for part-business bills.
  const preview = e('p', { class: 'rf-preview muted' });
  function updatePreview() {
    const amt = parseFloat(amountIn.value) || 0;
    const p = Math.max(0, Math.min(100, parseFloat(pctIn.value) || 0));
    if (amt > 0 && p < 100) {
      preview.textContent = 'Claimable as a business cost: ' + money(amt * (p / 100)) + ' (' + Math.round(p) + '% of ' + money(amt) + ')';
      preview.style.display = '';
    } else {
      preview.style.display = 'none';
    }
  }
  amountIn.addEventListener('input', updatePreview);
  pctIn.addEventListener('input', updatePreview);
  updatePreview();

  const grid = e('div', { class: 'rf-grid' }, [
    field('Attributed to', propSel),
    field('Date', dateIn),
    field('Supplier / vendor', vendorIn),
    field('Category', catIn),
    field('Amount (£)', amountIn, 'The full total on the receipt or bill.'),
    field('Business use %', pctIn, 'For a shared bill like electricity, the % that relates to the let.'),
    field('VAT (£)', vatIn, 'Reclaimable VAT within the amount — leave 0 if unsure.'),
    field('Payment method', methodIn),
  ]);

  const frag = document.createDocumentFragment();
  frag.appendChild(grid);
  frag.appendChild(field('Note', noteIn));
  frag.appendChild(e('label', { class: 'rf-check' }, [
    startupIn,
    e('span', {}, [
      e('strong', { text: 'One-off start-up cost' }),
      e('span', { class: 'rf-check-sub', text: ' — count it for tax, but leave it out of the “ongoing profit” figures.' }),
    ]),
  ]));
  frag.appendChild(field(fileOpts.label || 'Receipt file (photo or PDF)', fileIn, fileOpts.hint || 'Optional — up to 4MB. JPG, PNG, HEIC or PDF.'));

  // Auto-fill from an uploaded receipt (reads the image with the receipt reader).
  const parseStatus = e('p', { class: 'rf-parsestatus', role: 'status', 'aria-live': 'polite' });
  if (typeof fileOpts.onParse === 'function') {
    const today0 = today;
    let dateIsDefault = dateIn.value === today0;
    dateIn.addEventListener('input', () => { dateIsDefault = false; });

    function applyParsed(f) {
      if (!f) return;
      if (f.vendor && !vendorIn.value.trim()) vendorIn.value = f.vendor;
      if (f.category && !catIn.value.trim()) catIn.value = f.category;
      if (f.date && dateIsDefault) { dateIn.value = f.date; dateIsDefault = false; }
      if (f.amount > 0 && !amountIn.value.trim()) amountIn.value = String(f.amount);
      if (f.vat > 0 && !vatIn.value.trim()) vatIn.value = String(f.vat);
      updatePreview();
    }

    fileIn.addEventListener('change', async () => {
      const file = fileIn.files && fileIn.files[0];
      if (!file) return;
      const t = (file.type || '').toLowerCase();
      const supported = /^image\/(jpeg|jpg|png|webp|gif)$/.test(t) || t === 'application/pdf';
      if (!supported || file.size > 4.4 * 1024 * 1024) return; // HEIC/large: keep manual entry
      parseStatus.textContent = 'Reading receipt…';
      parseStatus.className = 'rf-parsestatus busy';
      try {
        const payload = await readFileAsB64(file);
        const out = await fileOpts.onParse(payload);
        if (!out || out.ok === false) {
          // Not configured → stay silent; any other failure → gentle nudge.
          parseStatus.textContent = out && out.configured === false ? '' : 'Couldn’t read it automatically — please fill the details in.';
          parseStatus.className = 'rf-parsestatus';
          return;
        }
        applyParsed(out.fields);
        parseStatus.textContent = 'Filled in from your receipt — please check the details are right.';
        parseStatus.className = 'rf-parsestatus ok';
      } catch {
        parseStatus.textContent = '';
        parseStatus.className = 'rf-parsestatus';
      }
    });
    frag.appendChild(parseStatus);
  }

  frag.appendChild(preview);
  frag.appendChild(catList);

  function validate() {
    if (!(parseFloat(amountIn.value) > 0)) return 'Please enter an amount greater than £0.';
    if (!dateIn.value) return 'Please choose a date for the receipt.';
    return null;
  }
  async function readPayload() {
    const payload = {
      property: propSel.value,
      date: dateIn.value,
      vendor: vendorIn.value,
      category: catIn.value,
      amount: parseFloat(amountIn.value),
      businessPct: pctIn.value === '' ? 100 : parseFloat(pctIn.value),
      vat: parseFloat(vatIn.value) || 0,
      method: methodIn.value,
      note: noteIn.value,
      startup: startupIn.checked,
    };
    const file = fileIn.files && fileIn.files[0];
    if (file) {
      if (file.size > 4.4 * 1024 * 1024) throw new Error('That file is over 4MB — please use a smaller photo or PDF.');
      payload.receipt = await readFileAsB64(file);
    }
    return payload;
  }
  return { frag, fileIn, validate, readPayload };
}

function addReceiptForm(properties, onAdd, onParse) {
  const details = e('details', { class: 'dash-card receipt-form' });
  details.appendChild(e('summary', { class: 'rf-summary' }, [
    e('span', { class: 'rf-plus', text: '＋' }),
    e('span', { text: 'Add a receipt / expense' }),
  ]));

  const form = e('form', { class: 'receipt-fields', novalidate: 'novalidate' });
  const fs = receiptFieldset(properties, {}, { onParse });
  const status = e('p', { class: 'rf-status', role: 'status', 'aria-live': 'polite' });
  const submit = e('button', { class: 'guest-btn rf-submit', type: 'submit', text: 'Save receipt' });

  form.appendChild(fs.frag);
  form.appendChild(e('div', { class: 'rf-actions' }, [submit, status]));
  details.appendChild(form);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errMsg = fs.validate();
    if (errMsg) { status.textContent = errMsg; status.className = 'rf-status err'; return; }
    submit.disabled = true;
    submit.textContent = 'Saving…';
    status.textContent = '';
    status.className = 'rf-status';
    try {
      await onAdd(await fs.readPayload());
      // onAdd triggers a re-render which replaces this form, so no reset needed.
    } catch (err) {
      submit.disabled = false;
      submit.textContent = 'Save receipt';
      status.textContent = err.message || 'Sorry, that could not be saved.';
      status.className = 'rf-status err';
    }
  });
  return details;
}

// Modal editor for an existing owner-entered expense. Lets you change any field
// and add, replace or remove the receipt file after the fact.
function editReceiptDialog(properties, expense, onUpdate, onParse) {
  const dlg = e('dialog', { class: 'rf-dialog' });
  const closeX = e('button', { class: 'rf-dialog-x', type: 'button', 'aria-label': 'Close', title: 'Close' }, '×');
  const form = e('form', { class: 'receipt-fields', novalidate: 'novalidate' });

  const fs = receiptFieldset(properties, expense, {
    label: expense.receiptId ? 'Replace receipt file' : 'Add a receipt file (photo or PDF)',
    hint: 'Optional — up to 4MB. JPG, PNG, HEIC or PDF.',
    onParse,
  });

  // Current-receipt row with a remove toggle (only if one is attached).
  let removeReceipt = false;
  let currentRow = null;
  if (expense.receiptId) {
    const nameEl = e('span', { class: 'rf-current-name', text: expense.receiptName || 'receipt attached' });
    const rm = e('button', { class: 'dash-linkbtn', type: 'button', text: 'Remove' });
    currentRow = e('div', { class: 'rf-current' }, [e('span', { class: 'muted', text: 'Current receipt: ' }), nameEl, rm]);
    rm.addEventListener('click', () => {
      removeReceipt = !removeReceipt;
      currentRow.classList.toggle('removing', removeReceipt);
      rm.textContent = removeReceipt ? 'Keep it' : 'Remove';
    });
  }

  const status = e('p', { class: 'rf-status', role: 'status', 'aria-live': 'polite' });
  const save = e('button', { class: 'guest-btn rf-submit', type: 'submit', text: 'Save changes' });
  const cancel = e('button', { class: 'dash-linkbtn', type: 'button', text: 'Cancel' });

  form.appendChild(e('div', { class: 'rf-dialog-head' }, [e('h3', { text: 'Edit expense' }), closeX]));
  form.appendChild(fs.frag);
  if (currentRow) form.appendChild(currentRow);
  form.appendChild(e('div', { class: 'rf-actions' }, [save, cancel, status]));
  dlg.appendChild(form);

  const close = () => dlg.close();
  cancel.addEventListener('click', close);
  closeX.addEventListener('click', close);
  dlg.addEventListener('close', () => dlg.remove());

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errMsg = fs.validate();
    if (errMsg) { status.textContent = errMsg; status.className = 'rf-status err'; return; }
    save.disabled = true;
    save.textContent = 'Saving…';
    status.textContent = '';
    status.className = 'rf-status';
    try {
      const payload = await fs.readPayload();
      payload.id = expense.id;
      if (removeReceipt && !payload.receipt) payload.removeReceipt = true;
      await onUpdate(payload);
      dlg.close();
    } catch (err) {
      save.disabled = false;
      save.textContent = 'Save changes';
      status.textContent = err.message || 'Sorry, that could not be saved.';
      status.className = 'rf-status err';
    }
  });
  return dlg;
}

// ---------- CSV export ----------
function exportExpensesCsv(expenses, properties, viewLabel) {
  const header = ['Date', 'Supplier', 'Category', 'Property', 'Amount (full)', 'Business %', 'Claimed', 'VAT reclaim', 'Method', 'Note', 'Receipt'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  expenses.forEach((x) => {
    lines.push([
      x.date,
      x.vendor || '',
      x.category || '',
      propLabel(x.property, properties),
      x.amount.toFixed(2),
      Math.round(x.businessPct),
      x.alloc.toFixed(2),
      (x.allocVat || 0).toFixed(2),
      x.method || '',
      x.note || '',
      x.receiptName || '',
    ].map(esc).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lde-expenses-' + viewLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const TAX_RATES = [
  { v: 0.2, label: 'Basic rate — 20%' },
  { v: 0.4, label: 'Higher rate — 40%' },
  { v: 0.45, label: 'Additional rate — 45%' },
];

function taxSummary(v, taxRate, onRateChange) {
  const rows = [
    ['Rental income (turnover)', money(v.grossIncome), false],
    ['Less: channel / booking fees', '− ' + money(v.fees), true],
    ['Less: running expenses', '− ' + money(v.expensesTotal), true],
    ['Taxable profit', money(v.netProfit), false, true],
    ['Cash received (net payouts)', money(v.netPayout), false],
    ['VAT within expenses (reclaimable if registered)', money(v.vatReclaim), false],
  ];
  const body = e('div', {}, [
    e('div', { class: 'tax-rows' }, rows.map((r) =>
      e('div', { class: 'tax-row' + (r[3] ? ' tax-row--total' : '') }, [
        e('span', { class: 'tax-k', text: r[0] }),
        e('span', { class: 'tax-v' + (r[2] ? ' neg' : ''), text: r[1] }),
      ])
    )),
  ]);

  // Ongoing profit — with one-off start-up costs stripped out (shown only when
  // some expenses are tagged as start-up). Start-up costs still reduce the
  // taxable profit above; this is a management view of underlying performance.
  if (v.startupTotal > 0) {
    body.appendChild(e('div', { class: 'tax-ongoing' }, [
      e('div', { class: 'tax-ongoing-row' }, [
        e('span', { class: 'tax-k', text: 'Of which: one-off start-up costs' }),
        e('span', { class: 'tax-v', text: money(v.startupTotal) }),
      ]),
      e('div', { class: 'tax-ongoing-row tax-ongoing-row--total' }, [
        e('span', { class: 'tax-k', text: 'Ongoing profit (excl. start-up)' }),
        e('span', { class: 'tax-v', text: money(v.ongoingProfit) }),
      ]),
      e('p', { class: 'tax-ongoing-note muted', text: 'Once the one-off start-up costs are behind you, this is roughly what the lets earn — about ' + money(v.ongoingProfitNight) + ' profit per night booked. (Start-up costs still count for tax above.)' }),
    ]));
  }

  // Estimated tax to set aside on the profit.
  const estTax = v.netProfit > 0 ? v.netProfit * taxRate : 0;
  const perMonth = estTax / 12;
  const reserve = e('div', { class: 'tax-reserve' }, [
    e('div', { class: 'tax-reserve-row' }, [
      e('div', {}, [
        e('div', { class: 'tax-reserve-label', text: 'Set aside for tax' }),
        e('div', { class: 'tax-reserve-sub', text: 'Estimated Income Tax at ' + Math.round(taxRate * 100) + '% of the profit' }),
      ]),
      e('div', { class: 'tax-reserve-amt', text: money(estTax) }),
    ]),
    estTax > 0
      ? e('div', { class: 'tax-reserve-month' }, [
          e('span', { text: '≈ ' }),
          e('strong', { text: money(perMonth) }),
          e('span', { text: ' a month to put by across the tax year' }),
        ])
      : e('div', { class: 'tax-reserve-month muted', text: 'No profit to set tax aside for yet.' }),
    e('p', { class: 'tax-reserve-note muted', text: 'A guide only — the actual bill depends on each owner’s other income and allowances. Check with your accountant.' }),
  ]);
  body.appendChild(reserve);

  // Rate selector in the card header.
  const sel = e('select', { class: 'tax-rate-sel' }, TAX_RATES.map((r) =>
    e('option', { value: String(r.v), text: r.label })));
  sel.value = String(taxRate);
  sel.addEventListener('change', () => onRateChange(parseFloat(sel.value)));
  const head = e('label', { class: 'tax-rate-field' }, [e('span', { text: 'Tax band' }), sel]);

  return card('Tax summary', '2026/27 tax year · 6 Apr 2026 – 5 Apr 2027', body, head);
}

// ---------- main ----------
export function initDashboard(root, data, opts = {}) {
  const { properties } = data;
  const api = opts.api || '/api/management';
  const code = opts.code || '';
  let view = 'all';
  let taxRate = parseFloat(sessionStorage.getItem('lde-mgmt-taxrate'));
  if (!(taxRate > 0)) taxRate = 0.2;
  function setTaxRate(r) {
    taxRate = r;
    try { sessionStorage.setItem('lde-mgmt-taxrate', String(r)); } catch { /* ignore */ }
    render();
  }

  async function apiCall(action, payload) {
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, action, ...payload }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || 'Request failed.');
    return out;
  }

  function toast(msg, kind) {
    const t = e('div', { class: 'dash-toast' + (kind ? ' ' + kind : ''), role: 'status', text: msg });
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3200);
  }

  const handlers = {
    async onAdd(payload) {
      const out = await apiCall('addExpense', payload);
      data.expenses.push(out.expense);
      render();
      toast('Receipt saved.', 'ok');
    },
    async onDelete(x) {
      if (!window.confirm('Delete this receipt' + (x.vendor ? ' from ' + x.vendor : '') + '? This cannot be undone.')) return;
      try {
        await apiCall('deleteExpense', { id: x.id });
        data.expenses = data.expenses.filter((it) => it.id !== x.id);
        render();
        toast('Receipt deleted.', 'ok');
      } catch (err) {
        toast(err.message || 'Could not delete.', 'err');
      }
    },
    async onAddBooking(payload) {
      const out = await apiCall('addBooking', payload);
      data.bookings.push(out.booking);
      render();
      toast('Booking saved.', 'ok');
    },
    async onImportBookings(bookings) {
      const out = await apiCall('addBookings', { bookings });
      (out.added || []).forEach((b) => data.bookings.push(b));
      if (out.addedCount) {
        render();
        toast('Imported ' + out.addedCount + ' booking' + (out.addedCount === 1 ? '' : 's') + '.', 'ok');
      } else {
        toast('No new bookings — all were already recorded.', 'ok');
      }
      return out;
    },
    async onDeleteBooking(b) {
      if (!window.confirm('Delete this booking' + (b.guest ? ' for ' + b.guest : '') + '? This cannot be undone.')) return;
      try {
        await apiCall('deleteBooking', { id: b.id });
        data.bookings = data.bookings.filter((it) => it.id !== b.id);
        render();
        toast('Booking deleted.', 'ok');
      } catch (err) {
        toast(err.message || 'Could not delete.', 'err');
      }
    },
    async onSavePricing(key, payload) {
      const out = await apiCall('updatePricing', { property: key, pricing: payload });
      if (out.pricing) {
        if (!data.pricing) data.pricing = {};
        data.pricing[key] = out.pricing;
      }
      toast('Pricing updated for ' + ((properties[key] && properties[key].name) || key) + '.', 'ok');
      return out;
    },
    async onRetryBalance(b, btn) {
      if (!window.confirm('Retry charging the ' + money(b.balance) + ' balance to the card on file for ' + (b.guest || 'this guest') + '?')) return;
      if (btn) { btn.disabled = true; btn.textContent = 'Charging…'; }
      try {
        const out = await apiCall('retryBalance', { id: b.id });
        if (out.booking) {
          const idx = data.bookings.findIndex((it) => it.id === b.id);
          if (idx >= 0) data.bookings[idx] = out.booking;
        }
        render();
        toast(out.paid ? 'Balance charged — paid in full.' : 'Balance charge attempted.', out.paid ? 'ok' : 'err');
      } catch (err) {
        toast(err.message || 'Could not charge the balance.', 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Retry balance'; }
      }
    },
    onEdit(x) {
      const dlg = editReceiptDialog(properties, x, async (payload) => {
        const out = await apiCall('updateExpense', payload);
        const i = data.expenses.findIndex((it) => it.id === x.id);
        if (i >= 0) data.expenses[i] = out.expense;
        render();
        toast('Receipt updated.', 'ok');
      }, handlers.onParse);
      root.appendChild(dlg);
      dlg.showModal();
    },
    // Read a receipt image with the AI receipt reader and return its fields.
    // Never throws — returns { ok:false } so the form quietly falls back to
    // manual entry when the reader is off or a receipt can't be read.
    async onParse(fileObj) {
      try {
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, action: 'parseReceipt', receipt: fileObj }),
        });
        return await res.json().catch(() => ({ ok: false }));
      } catch {
        return { ok: false };
      }
    },
    async onView(x) {
      try {
        const out = await apiCall('receipt', { id: x.receiptId });
        const bytes = Uint8Array.from(atob(out.data), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: out.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        toast(err.message || 'Could not open the receipt.', 'err');
      }
    },
  };

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

    // Quick link to the dedicated direct-bookings manager.
    body.appendChild(e('div', { class: 'dash-toplinks' }, [
      e('a', { class: 'dash-managelink', href: '/management/bookings/' }, 'Manage direct bookings →'),
    ]));

    // Add-booking and add-receipt forms are always available, in every view.
    body.appendChild(e('div', { class: 'dash-add-forms' }, [
      addBookingForm(properties, handlers.onAddBooking, handlers.onImportBookings),
      addReceiptForm(properties, handlers.onAdd, handlers.onParse),
    ]));

    // Calendar-sync setup: import URL(s) to block Airbnb for direct bookings.
    body.appendChild(syncNote(properties));

    // Owner pricing editor (rates + length-of-stay), if the feed provided it.
    if (data.pricing) {
      const ps = pricingSection(data.pricing, properties, handlers.onSavePricing);
      if (ps) body.appendChild(ps);
    }

    if (!v.bookings.length && !v.expenses.length) {
      body.appendChild(e('div', { class: 'dash-empty' }, [
        e('p', { text: 'No bookings or expenses recorded yet for ' + (view === 'the-rockery' ? 'The Rockery' : 'this property') + '.' }),
        e('p', { class: 'muted', text: 'The Rockery isn’t taking bookings yet — add a receipt above to start logging its costs, and its figures will appear here once it launches.' }),
      ]));
      return;
    }

    // KPI row
    const estTax = v.netProfit > 0 ? v.netProfit * taxRate : 0;
    body.appendChild(e('div', { class: 'dash-kpis' }, [
      kpi('Rental income', money(v.grossIncome), 'gross, before fees'),
      kpi('Channel fees', money(v.fees), 'Airbnb service fees'),
      kpi('Expenses', money(v.expensesTotal), v.vatReclaim ? money(v.vatReclaim) + ' VAT' : 'running costs'),
      kpi('Net profit', money(v.netProfit), 'income − fees − costs', v.netProfit >= 0 ? 'pos' : 'neg'),
      v.startupTotal > 0 ? kpi('Profit excl. start-up', money(v.ongoingProfit), money(v.startupTotal) + ' one-off costs removed', 'pos') : null,
      kpi('Tax to set aside', money(estTax), '@ ' + Math.round(taxRate * 100) + '% · ~' + money(estTax / 12, true) + '/mo', 'tax'),
      kpi('Occupancy', pct(v.occupancy), 'nights booked / available'),
      kpi('Nights booked', String(v.nights), v.bookings.length + ' bookings'),
      kpi('Avg. nightly', money(v.avgNightly), 'gross per night booked'),
      kpi('Avg. profit / night', money(v.avgProfitNight), 'net profit per night', v.avgProfitNight >= 0 ? 'pos' : 'neg'),
      v.startupTotal > 0 ? kpi('Profit / night excl. start-up', money(v.ongoingProfitNight), 'ongoing, one-off costs removed', 'pos') : null,
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
    body.appendChild(taxSummary(v, taxRate, setTaxRate));

    // Bookings table — with CSV export in its header.
    let bkgCsv = null;
    if (v.bookings.length) {
      bkgCsv = e('button', { class: 'dash-linkbtn dash-csv', type: 'button', text: '⬇ Export CSV' });
      bkgCsv.addEventListener('click', () =>
        exportBookingsCsv(v.bookings, properties, views.find((x) => x.id === view).label));
    }
    const bt = bookingsTable(v.bookings, properties, handlers, bkgCsv);
    if (bt) body.appendChild(bt);

    // Expenses table — with CSV export in its header.
    let csvBtn = null;
    if (v.expenses.length) {
      csvBtn = e('button', { class: 'dash-linkbtn dash-csv', type: 'button', text: '⬇ Export CSV' });
      csvBtn.addEventListener('click', () =>
        exportExpensesCsv(v.expenses, properties, views.find((x) => x.id === view).label));
    }
    body.appendChild(expensesTable(v.expenses, properties, handlers, csvBtn));
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
