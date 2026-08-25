// ─────────────────────────────────────────────────────────────────────────
// PRICING — owner-editable rates layered over the code defaults in
// management-data.mjs (PRICING). Overrides live in the `mgmt-pricing` Netlify
// Blobs store so the owner can change prices from the dashboard without a code
// change. Supports length-of-stay rates: a base nightly rate (applied at the
// minimum stay) plus tiers like "3+ nights" and "7+ nights (a week)".
// ─────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs';
import { PRICING, PROPERTIES } from './management-data.mjs';

const STORE = 'mgmt-pricing';
// Separate store for machine-written external price feeds (the plug-in point for
// market-data engines like PriceLabs). Keyed by property → { rates, source,
// updatedAt }. A future scheduled importer writes here; pricing reads it.
const FEED_STORE = 'mgmt-price-feed';

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : undefined;
}
function round2(n) {
  const x = num(n);
  return x === undefined ? 0 : Math.round((x + Number.EPSILON) * 100) / 100;
}

// Numeric fields the owner may override.
const NUM_FIELDS = ['nightly', 'cleaningFee', 'minNights', 'maxGuests', 'maxInfants', 'maxDogs', 'depositPct', 'balanceDueDays'];

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}
export async function loadPricingOverrides() {
  try {
    const o = await store().get('pricing', { type: 'json' });
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}
async function savePricingOverrides(obj) {
  await store().setJSON('pricing', obj);
}

// Normalise a length-of-stay tier list: [{minNights, nightly}], min>1, rate>0,
// sorted ascending by minNights, deduped by minNights.
function cleanTiers(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const mn = Math.round(num(t && t.minNights) || 0);
    const nr = round2(t && t.nightly);
    if (mn > 1 && nr > 0 && !seen.has(mn)) {
      seen.add(mn);
      out.push({ minNights: mn, nightly: nr });
    }
  }
  return out.sort((a, b) => a.minNights - b.minNights);
}

// Normalise seasonal date-range rates: [{name, start, end, nightly}] where
// start/end are ISO dates (inclusive of the nights on those dates), rate>0 and
// start<=end. Sorted by start date.
function cleanSeasons(list) {
  if (!Array.isArray(list)) return [];
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : '');
  const out = [];
  for (const s of list) {
    const start = iso(s && s.start);
    const end = iso(s && s.end);
    const nr = round2(s && s.nightly);
    if (start && end && start <= end && nr > 0) {
      out.push({ name: String((s && s.name) || '').slice(0, 60), start, end, nightly: nr });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// The seasonal nightly rate for a given date (ISO), or null if no season covers
// it. First matching season wins.
export function seasonRateFor(cfg, dateIso) {
  const d = String(dateIso).slice(0, 10);
  for (const s of cfg.seasons || []) {
    if (s.start <= d && d <= s.end) return s.nightly;
  }
  return null;
}

// ---- dynamic (rule-based) pricing ------------------------------------------
// In-house rules that react to the booking (day-of-week, lead time) with safety
// guardrails. External market feeds slot in ABOVE this (see resolveNightRate).
function pct(v) {
  const n = num(v);
  if (n === undefined) return 0;
  return Math.max(-90, Math.min(300, n));
}
function cleanDynamic(o) {
  o = o || {};
  const leadTime = Array.isArray(o.leadTime)
    ? o.leadTime
        .map((t) => ({ withinDays: Math.round(num(t && t.withinDays) || 0), pct: pct(t && t.pct) }))
        .filter((t) => t.withinDays > 0 && t.pct !== 0)
        .sort((a, b) => a.withinDays - b.withinDays)
    : [];
  const floor = num(o.floor);
  const ceiling = num(o.ceiling);
  return {
    enabled: !!o.enabled,
    weekendPct: pct(o.weekendPct),
    leadTime,
    floor: floor !== undefined && floor > 0 ? round2(floor) : null,
    ceiling: ceiling !== undefined && ceiling > 0 ? round2(ceiling) : null,
    applyOverFeed: !!o.applyOverFeed,
  };
}
// Fri or Sat night (getUTCDay: Sun=0 … Sat=6).
export function isWeekendNight(dateIso) {
  const d = new Date(dateIso + 'T00:00:00Z').getUTCDay();
  return d === 5 || d === 6;
}
// Last-minute multiplier for a stay `daysToCheckin` away. Tightest matching tier
// wins (tiers are sorted ascending by withinDays).
export function leadTimeFactor(dyn, daysToCheckin) {
  if (daysToCheckin == null || !dyn.leadTime || !dyn.leadTime.length) return 1;
  for (const t of dyn.leadTime) {
    if (daysToCheckin <= t.withinDays) return 1 + t.pct / 100;
  }
  return 1;
}
export function clampRate(rate, dyn) {
  let r = rate;
  if (dyn.floor != null && r < dyn.floor) r = dyn.floor;
  if (dyn.ceiling != null && r > dyn.ceiling) r = dyn.ceiling;
  return r;
}

// ---- external price feed (plug-in point) -----------------------------------
function feedStore() {
  return getStore({ name: FEED_STORE, consistency: 'strong' });
}
// Returns { rates:{date:rate}, source, updatedAt, count } or null.
export async function loadFeed(property) {
  try {
    const o = await feedStore().get(property, { type: 'json' });
    return o && typeof o === 'object' && o.rates ? o : null;
  } catch {
    return null;
  }
}
// Machine importers (or manual testing) push a feed here.
export async function saveFeed(property, rates, source) {
  const clean = {};
  for (const k of Object.keys(rates || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      const r = round2(rates[k]);
      if (r > 0) clean[k] = r;
    }
  }
  const rec = { rates: clean, source: String(source || 'feed').slice(0, 40), updatedAt: new Date().toISOString(), count: Object.keys(clean).length };
  await feedStore().setJSON(property, rec);
  return { count: rec.count };
}
export async function clearFeed(property) {
  try {
    await feedStore().delete(property);
  } catch {
    /* already gone */
  }
}
export async function feedMeta(property) {
  const f = await loadFeed(property);
  return f ? { source: f.source, updatedAt: f.updatedAt, count: f.count || Object.keys(f.rates || {}).length } : null;
}

// Merge an override object over the code default for one property.
export function mergeCfg(key, override) {
  const base = PRICING[key] || {};
  const o = override || {};
  const cfg = { ...base };
  for (const f of NUM_FIELDS) {
    if (o[f] !== undefined && o[f] !== null && o[f] !== '') {
      const n = num(o[f]);
      if (n !== undefined) cfg[f] = n;
    }
  }
  if (o.bookable !== undefined) cfg.bookable = !!o.bookable;
  cfg.losTiers = cleanTiers(o.losTiers !== undefined ? o.losTiers : base.losTiers);
  cfg.seasons = cleanSeasons(o.seasons !== undefined ? o.seasons : base.seasons);
  cfg.dynamic = cleanDynamic(o.dynamic !== undefined ? o.dynamic : base.dynamic);
  return cfg;
}

export async function effectivePricing(key) {
  const all = await loadPricingOverrides();
  return mergeCfg(key, all[key]);
}
export async function allEffectivePricing() {
  const all = await loadPricingOverrides();
  const out = {};
  for (const key of Object.keys(PRICING)) out[key] = mergeCfg(key, all[key]);
  return out;
}

// The per-night rate for a stay of `nights`, honouring length-of-stay tiers.
// The base `nightly` applies from the minimum stay; each tier that the stay
// reaches overrides it (highest qualifying minNights wins).
export function nightlyRateFor(cfg, nights) {
  let rate = num(cfg.nightly) || 0;
  for (const t of cfg.losTiers || []) {
    if (nights >= t.minNights && t.nightly > 0) rate = t.nightly;
  }
  return rate;
}

// Owner edit of a property's pricing. Returns { pricing } (merged effective) or
// { error }.
export async function updatePropertyPricing(key, input) {
  if (!PRICING[key] || !PROPERTIES[key]) return { error: 'Unknown property.' };
  const all = await loadPricingOverrides();
  const next = { ...(all[key] || {}) };

  for (const f of NUM_FIELDS) {
    if (input[f] !== undefined && input[f] !== '') {
      const n = num(input[f]);
      if (n === undefined || n < 0) return { error: `Please enter a valid ${f}.` };
      next[f] = f === 'nightly' || f === 'cleaningFee' ? round2(n) : Math.round(n);
    }
  }
  if (next.nightly !== undefined && !(next.nightly > 0)) return { error: 'Nightly rate must be greater than £0.' };
  if (next.minNights !== undefined && next.minNights < 1) return { error: 'Minimum nights must be at least 1.' };
  if (input.bookable !== undefined) next.bookable = !!input.bookable;
  if (input.losTiers !== undefined) next.losTiers = cleanTiers(input.losTiers);
  if (input.seasons !== undefined) next.seasons = cleanSeasons(input.seasons);
  if (input.dynamic !== undefined) next.dynamic = cleanDynamic(input.dynamic);

  all[key] = next;
  await savePricingOverrides(all);
  return { pricing: mergeCfg(key, next) };
}
