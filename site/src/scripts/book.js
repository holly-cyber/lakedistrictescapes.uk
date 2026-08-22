// Public direct-booking widget. Talks to /api/book:
//   config   → bookable properties + rules
//   quote    → live price + availability as dates change
//   checkout → creates the Stripe deposit session and redirects
//
// Prices are always computed server-side; this script only displays them.

const API = '/api/book';
const money = (n, ccy = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).format(Number(n) || 0);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso, days) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

async function post(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export async function initBook(root, opts = {}) {
  let config;
  try {
    config = await post({ action: 'config' });
  } catch {
    root.innerHTML =
      '<p class="book-msg err">Sorry — booking is temporarily unavailable. Please use the enquiry form.</p>';
    return;
  }

  const properties = config.properties || {};
  const keys = Object.keys(properties);
  if (!config.configured || keys.length === 0) {
    root.innerHTML =
      '<div class="book-msg"><p><strong>Online booking is coming soon.</strong></p>' +
      '<p>In the meantime, please send us your dates through the enquiry form and we’ll confirm availability and take payment directly.</p>' +
      '<p><a class="btn btn-green" href="/primrose-cottage/#enquire">Enquire about your stay</a></p></div>';
    return;
  }

  const preferred = opts.property && properties[opts.property] ? opts.property : keys[0];

  root.innerHTML = `
    <form class="book-form" novalidate>
      <div class="book-grid">
        <div class="book-panel">
          <h2 class="book-h">Your stay</h2>
          ${
            keys.length > 1
              ? `<div class="bf-field">
                   <label for="bk-prop">Property</label>
                   <select id="bk-prop" name="property">
                     ${keys.map((k) => `<option value="${esc(k)}" ${k === preferred ? 'selected' : ''}>${esc(properties[k].name)}</option>`).join('')}
                   </select>
                 </div>`
              : `<input type="hidden" id="bk-prop" value="${esc(preferred)}" />
                 <p class="bf-prop-name">${esc(properties[preferred].name)}</p>`
          }
          <div class="bf-row">
            <div class="bf-field">
              <label for="bk-arrive">Arrival</label>
              <input id="bk-arrive" name="arrive" type="date" min="${todayISO()}" required />
            </div>
            <div class="bf-field">
              <label for="bk-depart">Departure</label>
              <input id="bk-depart" name="depart" type="date" min="${addDaysISO(todayISO(), 1)}" required />
            </div>
          </div>
          <div class="bf-field bf-guests">
            <label for="bk-guests">Guests</label>
            <input id="bk-guests" name="guests" type="number" min="1" step="1" value="2" required />
            <span class="bf-hint" id="bk-cap"></span>
          </div>
          <div class="bf-row">
            <div class="bf-field" id="bk-infants-field" hidden>
              <label for="bk-infants">Children under 2</label>
              <input id="bk-infants" name="infants" type="number" min="0" step="1" value="0" />
            </div>
            <div class="bf-field" id="bk-dogs-field" hidden>
              <label for="bk-dogs">Dogs</label>
              <input id="bk-dogs" name="dogs" type="number" min="0" step="1" value="0" />
            </div>
          </div>

          <h2 class="book-h book-h-2">Your details</h2>
          <div class="bf-field">
            <label for="bk-name">Full name</label>
            <input id="bk-name" name="name" type="text" autocomplete="name" required />
          </div>
          <div class="bf-row">
            <div class="bf-field">
              <label for="bk-email">Email</label>
              <input id="bk-email" name="email" type="email" autocomplete="email" required />
            </div>
            <div class="bf-field">
              <label for="bk-phone">Phone</label>
              <input id="bk-phone" name="phone" type="tel" autocomplete="tel" placeholder="Optional" />
            </div>
          </div>
        </div>

        <aside class="book-summary" aria-live="polite">
          <div id="bk-quote" class="bk-quote"></div>
          <label class="bk-terms">
            <input id="bk-terms" type="checkbox" />
            <span>I agree to pay the deposit now and authorise the balance to be charged to this card ${esc(
              String(properties[preferred].balanceDueDays),
            )} days before arrival.</span>
          </label>
          <button type="submit" class="bk-submit" id="bk-submit" disabled>Choose your dates</button>
          <p class="bk-secure">Secure payment by Stripe · your card details never touch our servers.</p>
          <p class="book-msg err" id="bk-error" hidden></p>
        </aside>
      </div>
    </form>`;

  const form = root.querySelector('.book-form');
  const propEl = root.querySelector('#bk-prop');
  const arrive = root.querySelector('#bk-arrive');
  const depart = root.querySelector('#bk-depart');
  const guests = root.querySelector('#bk-guests');
  const cap = root.querySelector('#bk-cap');
  const dogsField = root.querySelector('#bk-dogs-field');
  const dogs = root.querySelector('#bk-dogs');
  const infantsField = root.querySelector('#bk-infants-field');
  const infants = root.querySelector('#bk-infants');
  const quoteBox = root.querySelector('#bk-quote');
  const terms = root.querySelector('#bk-terms');
  const submit = root.querySelector('#bk-submit');
  const errBox = root.querySelector('#bk-error');
  const termsLabel = root.querySelector('.bk-terms span');

  const propOf = () => (propEl.tagName === 'SELECT' ? propEl.value : propEl.value);
  let lastQuote = null;
  let quoteTimer = null;
  let quoteSeq = 0;

  function applyRules() {
    const cfg = properties[propOf()];
    if (!cfg) return;
    guests.max = String(cfg.maxGuests);
    if (Number(guests.value) > cfg.maxGuests) guests.value = String(cfg.maxGuests);
    cap.textContent = `Sleeps up to ${cfg.maxGuests} · minimum ${cfg.minNights} nights`;

    // Dogs + under-2s: only offer them where the property allows.
    const maxDogs = Number(cfg.maxDogs) || 0;
    const maxInfants = Number(cfg.maxInfants) || 0;
    dogsField.hidden = maxDogs <= 0;
    infantsField.hidden = maxInfants <= 0;
    if (maxDogs > 0) {
      dogs.max = String(maxDogs);
      if (Number(dogs.value) > maxDogs) dogs.value = String(maxDogs);
    } else dogs.value = '0';
    if (maxInfants > 0) {
      infants.max = String(maxInfants);
      if (Number(infants.value) > maxInfants) infants.value = String(maxInfants);
    } else infants.value = '0';
    if (termsLabel) {
      termsLabel.textContent = `I agree to pay the deposit now and authorise the balance to be charged to this card ${cfg.balanceDueDays} days before arrival.`;
    }
    // keep departure after arrival
    if (arrive.value) depart.min = addDaysISO(arrive.value, cfg.minNights);
  }

  function setError(msg) {
    if (!msg) {
      errBox.hidden = true;
      errBox.textContent = '';
    } else {
      errBox.hidden = false;
      errBox.textContent = msg;
    }
  }

  function renderQuote(q, available) {
    lastQuote = available === false ? null : q;
    const cfg = properties[propOf()];
    quoteBox.innerHTML = `
      <h3 class="bk-quote-h">Price</h3>
      <div class="bk-line"><span>${esc(String(q.nights))} night${q.nights === 1 ? '' : 's'} × ${money(q.nightly, q.currency)}</span><span>${money(q.subtotal, q.currency)}</span></div>
      ${q.cleaning > 0 ? `<div class="bk-line"><span>Cleaning</span><span>${money(q.cleaning, q.currency)}</span></div>` : ''}
      <div class="bk-line bk-total"><span>Total</span><span>${money(q.total, q.currency)}</span></div>
      <div class="bk-split">
        <div class="bk-line bk-now"><span>Deposit today (${esc(String(q.depositPct))}%)</span><span>${money(q.deposit, q.currency)}</span></div>
        <div class="bk-line bk-later"><span>Balance auto-charged ${fmtDate(q.balanceDueDate)}</span><span>${money(q.balance, q.currency)}</span></div>
      </div>
      ${
        available === false
          ? '<p class="bk-unavail">Those dates aren’t available. Please choose different dates.</p>'
          : `<p class="bk-arrive-note">${esc(fmtDate(q.start))} → ${esc(fmtDate(q.end))}</p>`
      }`;
    updateSubmit();
  }

  function clearQuote(msg) {
    lastQuote = null;
    quoteBox.innerHTML = `<p class="bk-quote-empty">${esc(msg || 'Choose your dates to see the price.')}</p>`;
    updateSubmit();
  }

  function updateSubmit() {
    const ready = Boolean(lastQuote) && terms.checked;
    submit.disabled = !ready;
    submit.textContent = lastQuote
      ? `Pay ${money(lastQuote.deposit, lastQuote.currency)} deposit & confirm`
      : 'Choose your dates';
  }

  function requestQuote() {
    setError('');
    const a = arrive.value;
    const d = depart.value;
    if (!a || !d) return clearQuote();
    if (d <= a) return clearQuote('Departure must be after arrival.');
    const seq = ++quoteSeq;
    quoteBox.classList.add('is-loading');
    post({ action: 'quote', property: propOf(), start: a, end: d, guests: Number(guests.value) || 1, dogs: Number(dogs.value) || 0, infants: Number(infants.value) || 0 })
      .then((res) => {
        if (seq !== quoteSeq) return; // a newer request superseded this one
        quoteBox.classList.remove('is-loading');
        renderQuote(res.quote, res.available);
      })
      .catch((err) => {
        if (seq !== quoteSeq) return;
        quoteBox.classList.remove('is-loading');
        clearQuote(err.message);
      });
  }

  function debouncedQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(requestQuote, 250);
  }

  if (propEl.tagName === 'SELECT') propEl.addEventListener('change', () => { applyRules(); requestQuote(); });
  arrive.addEventListener('change', () => { applyRules(); debouncedQuote(); });
  depart.addEventListener('change', debouncedQuote);
  guests.addEventListener('change', debouncedQuote);
  dogs.addEventListener('change', debouncedQuote);
  infants.addEventListener('change', debouncedQuote);
  terms.addEventListener('change', updateSubmit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    if (!lastQuote) return setError('Please choose available dates first.');
    const name = root.querySelector('#bk-name').value.trim();
    const email = root.querySelector('#bk-email').value.trim();
    const phone = root.querySelector('#bk-phone').value.trim();
    if (!name) return setError('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Please enter a valid email address.');
    if (!terms.checked) return setError('Please tick the box to authorise the balance payment.');

    submit.disabled = true;
    submit.textContent = 'Redirecting to secure payment…';
    try {
      const res = await post({
        action: 'checkout',
        property: propOf(),
        start: arrive.value,
        end: depart.value,
        guests: Number(guests.value) || 1,
        dogs: Number(dogs.value) || 0,
        infants: Number(infants.value) || 0,
        name,
        email,
        phone,
      });
      if (res.url) {
        window.location.assign(res.url);
      } else {
        throw new Error('Could not start payment.');
      }
    } catch (err) {
      setError(err.message);
      submit.disabled = false;
      updateSubmit();
    }
  });

  applyRules();
  clearQuote();
}
