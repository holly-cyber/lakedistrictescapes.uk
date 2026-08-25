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

  all[key] = next;
  await savePricingOverrides(all);
  return { pricing: mergeCfg(key, next) };
}
