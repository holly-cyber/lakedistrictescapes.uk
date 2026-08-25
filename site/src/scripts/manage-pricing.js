// Pricing manager (gated, on the management subdomain). The full pricing editor
// — base nightly, minimum stay, length-of-stay rates, seasonal rates, and the
// in-house dynamic rules — moved out of the main dashboard onto its own page.
// Talks to /api/management with the owner's access code.

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

function card(title, subtitle, body) {
  return el('div', { class: 'dash-card' }, [
    el('div', { class: 'dash-card-h' }, [el('div', {}, [el('h3', { text: title }), subtitle ? el('p', { class: 'dash-card-sub', text: subtitle }) : null])]),
    body,
  ]);
}

export function initPricing(root, data, ctx) {
  const pricing = (data && data.pricing) || {};
  const properties = (data && data.properties) || {};

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
  function toast(msg, kind) {
    let t = root.querySelector('.mb-toast');
    if (!t) { t = el('div', { class: 'mb-toast' }); root.appendChild(t); }
    t.textContent = msg;
    t.className = 'mb-toast show ' + (kind === 'err' ? 'err' : 'ok');
    setTimeout(() => { t.className = 'mb-toast'; }, 3000);
  }

  function propertyCard(key) {
    const p = pricing[key];
    if (!p) return null;
    const name = (properties[key] && properties[key].name) || key;
    const inputs = {};
    const field = (label, fname, val, step) => {
      const inp = el('input', { class: 'price-in', type: 'number', min: '0', step: step || '1', value: val == null ? '' : String(val) });
      inputs[fname] = inp;
      return el('label', { class: 'price-field' }, [el('span', { text: label }), inp]);
    };

    const tiersWrap = el('div', { class: 'price-tiers' });
    const tierRows = [];
    function addTierRow(t) {
      const minIn = el('input', { class: 'price-in price-in-sm', type: 'number', min: '2', step: '1', value: t ? String(t.minNights) : '', placeholder: 'nights' });
      const rateIn = el('input', { class: 'price-in price-in-sm', type: 'number', min: '0', step: '0.01', value: t ? String(t.nightly) : '', placeholder: '£' });
      const hint = el('span', { class: 'price-tier-hint' });
      const upd = () => {
        const n = Number(minIn.value), r = Number(rateIn.value);
        hint.textContent = n > 0 && r > 0 ? '= ' + money(n * r) + (n === 7 ? ' / week' : '') : '';
      };
      minIn.addEventListener('input', upd);
      rateIn.addEventListener('input', upd);
      const del = el('button', { class: 'price-tier-del', type: 'button', title: 'Remove', 'aria-label': 'Remove rate' }, '×');
      const rec = { minIn, rateIn };
      const row = el('div', { class: 'price-tier-row' }, [
        el('span', { class: 'price-tier-lbl', text: 'From' }), minIn,
        el('span', { class: 'price-tier-lbl', text: 'nights →' }), rateIn,
        el('span', { class: 'price-tier-lbl', text: '/night' }), hint, del,
      ]);
      tierRows.push(rec);
      del.addEventListener('click', () => { const i = tierRows.indexOf(rec); if (i >= 0) tierRows.splice(i, 1); row.remove(); });
      tiersWrap.appendChild(row);
      upd();
    }
    (p.losTiers || []).forEach(addTierRow);
    const addBtn = el('button', { class: 'dash-linkbtn', type: 'button', text: '+ Add a length-of-stay rate', onclick: () => addTierRow() });

    const seasonsWrap = el('div', { class: 'price-tiers' });
    const seasonRows = [];
    function addSeasonRow(s) {
      const nameIn = el('input', { class: 'price-in price-in-md', type: 'text', maxlength: '60', value: s ? s.name || '' : '', placeholder: 'e.g. Peak summer' });
      const startIn = el('input', { class: 'price-in price-in-sm', type: 'date', value: s ? s.start : '' });
      const endIn = el('input', { class: 'price-in price-in-sm', type: 'date', value: s ? s.end : '' });
      const rateIn = el('input', { class: 'price-in price-in-sm', type: 'number', min: '0', step: '0.01', value: s ? String(s.nightly) : '', placeholder: '£' });
      const del = el('button', { class: 'price-tier-del', type: 'button', title: 'Remove', 'aria-label': 'Remove season' }, '×');
      const rec = { nameIn, startIn, endIn, rateIn };
      const row = el('div', { class: 'price-season-row' }, [
        nameIn,
        el('span', { class: 'price-tier-lbl', text: '' }), startIn,
        el('span', { class: 'price-tier-lbl', text: '→' }), endIn,
        el('span', { class: 'price-tier-lbl', text: '£' }), rateIn,
        el('span', { class: 'price-tier-lbl', text: '/night' }), del,
      ]);
      seasonRows.push(rec);
      del.addEventListener('click', () => { const i = seasonRows.indexOf(rec); if (i >= 0) seasonRows.splice(i, 1); row.remove(); });
      seasonsWrap.appendChild(row);
    }
    (p.seasons || []).forEach(addSeasonRow);
    const addSeasonBtn = el('button', { class: 'dash-linkbtn', type: 'button', text: '+ Add a seasonal rate', onclick: () => addSeasonRow() });

    const d = p.dynamic || {};
    const lt = {};
    (d.leadTime || []).forEach((t) => { lt[t.withinDays] = t.pct; });
    const dinp = (val) => el('input', { class: 'price-in price-in-sm', type: 'number', step: '1', value: val == null || val === '' ? '' : String(val) });
    const dynEnabled = el('input', { type: 'checkbox' });
    if (d.enabled) dynEnabled.checked = true;
    const weekendPct = dinp(d.weekendPct || '');
    const lm7 = dinp(lt[7] != null ? lt[7] : '');
    const lm14 = dinp(lt[14] != null ? lt[14] : '');
    const floorIn = dinp(d.floor != null ? d.floor : '');
    const ceilIn = dinp(d.ceiling != null ? d.ceiling : '');
    const feed = p._feed;
    const feedLine = feed
      ? 'External market feed: ' + feed.source + ' — ' + feed.count + ' dates, updated ' + String(feed.updatedAt).slice(0, 10) + '.'
      : 'External market feed: none connected (in-house rules only). Ready to plug in later.';
    const dynBlock = el('div', { class: 'price-dyn' }, [
      el('div', { class: 'price-tiers-head', text: 'Dynamic pricing (rules)' }),
      el('label', { class: 'price-dyn-toggle' }, [dynEnabled, el('span', { text: ' Enable dynamic pricing rules' })]),
      el('div', { class: 'price-grid' }, [
        el('label', { class: 'price-field' }, [el('span', { text: 'Weekend uplift % (Fri/Sat)' }), weekendPct]),
        el('label', { class: 'price-field' }, [el('span', { text: 'Last-minute: within 7 days %' }), lm7]),
        el('label', { class: 'price-field' }, [el('span', { text: 'Last-minute: within 14 days %' }), lm14]),
        el('label', { class: 'price-field' }, [el('span', { text: 'Price floor (£/night)' }), floorIn]),
        el('label', { class: 'price-field' }, [el('span', { text: 'Price ceiling (£/night)' }), ceilIn]),
      ]),
      el('p', { class: 'price-note', text: 'Rules apply on top of your base / seasonal / length-of-stay rates. Use a negative % for discounts (e.g. -15 for last-minute). Floor & ceiling keep prices within safe bounds.' }),
      el('p', { class: 'price-feed', text: feedLine }),
    ]);

    const status = el('p', { class: 'price-status' });
    const saveBtn = el('button', {
      class: 'mb-btn', type: 'button', text: 'Save prices',
      onclick: async () => {
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
          const out = await api('updatePricing', { property: key, pricing: payload });
          if (out.pricing) pricing[key] = { ...out.pricing, _feed: pricing[key] && pricing[key]._feed };
          status.textContent = 'Saved ✓';
          status.className = 'price-status ok';
          toast('Pricing updated for ' + name + '.', 'ok');
        } catch (err) {
          status.textContent = err.message || 'Could not save.';
          status.className = 'price-status err';
          toast(err.message || 'Could not save.', 'err');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save prices';
      },
    });

    const cardBody = el('div', { class: 'price-body' }, [
      el('div', { class: 'price-grid' }, [
        field('Nightly rate (£)', 'nightly', p.nightly, '0.01'),
        field('Minimum nights', 'minNights', p.minNights),
        field('Cleaning fee (£)', 'cleaningFee', p.cleaningFee || 0, '0.01'),
        field('Deposit %', 'depositPct', p.depositPct),
        field('Balance due (days before)', 'balanceDueDays', p.balanceDueDays),
        field('Max guests', 'maxGuests', p.maxGuests),
        field('Max under-2s', 'maxInfants', p.maxInfants || 0),
        field('Max dogs', 'maxDogs', p.maxDogs || 0),
      ]),
      el('p', { class: 'price-note', text: 'The nightly rate applies to your shortest stay (the minimum nights above). Add rates below for longer stays — e.g. a lower per-night rate from 3 nights, and a weekly rate from 7 nights.' }),
      el('div', { class: 'price-tiers-head', text: 'Length-of-stay rates' }),
      tiersWrap,
      addBtn,
      el('div', { class: 'price-tiers-head', text: 'Seasonal rates (peak / off-peak dates)' }),
      el('p', { class: 'price-note', text: 'Set a per-night rate for specific date ranges (e.g. peak summer, Christmas). Seasonal rates override the standard/length-of-stay rate for nights that fall within them.' }),
      seasonsWrap,
      addSeasonBtn,
      dynBlock,
      el('div', { class: 'price-actions' }, [saveBtn, status]),
    ]);
    return card('Pricing — ' + name, p.bookable ? 'live for direct booking' : 'not open for direct booking yet', cardBody);
  }

  root.textContent = '';
  root.appendChild(el('div', { class: 'mb-topbar' }, [
    el('a', { class: 'mb-back', href: '/management/' }, '← Back to dashboard'),
  ]));

  const keys = Object.keys(pricing);
  if (!keys.length) {
    root.appendChild(el('div', { class: 'mb-empty', text: 'No pricing to show.' }));
    return;
  }
  const wrap = el('div', { class: 'price-wrap' });
  keys.forEach((key) => { const c = propertyCard(key); if (c) wrap.appendChild(c); });
  root.appendChild(wrap);
}
