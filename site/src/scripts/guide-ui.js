// Shared client-side rendering for the guest guide (used by /guest/ and the
// private cottage guide). Guide *text* is always added via text nodes so any
// [[ placeholders ]] stay visible and nothing is ever injected as HTML. The
// only innerHTML use is for the hard-coded, trusted icon SVG strings below.

export function appendText(el, text) {
  const re = /\[\[(.+?)\]\]/g;
  let last = 0,
    m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'ph';
    span.textContent = m[1].trim();
    el.appendChild(span);
    last = re.lastIndex;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) appendText(n, text);
  return n;
}

export const ICONS = {
  eat: '<path d="M7 3v18M5 3v5a2 2 0 004 0V3"/><path d="M16 3c-1.6 0-2.8 2.4-2.8 5.3 0 2.1 1 3.4 2 3.8V21h1.6V3z"/>',
  shop: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  explore: '<path d="M3 20l6-9 4 6 3-4 5 7z" stroke-linejoin="round"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l8 8M16 16l2-2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0114 0"/><path d="M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
  flame: '<path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3"/>',
  kitchen: '<rect x="4" y="9" width="16" height="11" rx="2"/><circle cx="9" cy="14" r="1.4"/><circle cx="15" cy="14" r="1.4"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 13h16M12 9v11M12 9S9.5 4.5 7.5 6.2 12 9 12 9zM12 9s2.5-4.5 4.5-2.8S12 9 12 9z"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
  droplet: '<path d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z"/>',
  bin: '<path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 16V8h3a2.5 2.5 0 010 5h-3"/>',
  bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h5l-3 8M9 9h4"/>',
  leave: '<path d="M15 3H5v18h10"/><path d="M11 12h9M17 9l3 3-3 3"/>',
  help: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.6"/>',
  run: '<path d="M4 7l6 5-6 5M12 7l6 5-6 5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.5 5.1-4.7 2.1 2.5-5.1z" stroke-linejoin="round"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
};
const CHEVRON = '<path d="M6 9l6 6 6-6"/>';

export function svg(paths, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6');
  s.setAttribute('stroke-linecap', 'round');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = paths;
  return s;
}

export function iconKeyFor(title) {
  const t = (title || '').toLowerCase();
  // flame checked before "eat" — "hEATing" and "hot water" would otherwise collide
  if (t.includes('log burner') || t.includes('heating') || t.includes('hot water') || t.includes('fire')) return 'flame';
  if (t.includes('eat') || t.includes('drink')) return 'eat';
  if (t.includes('shop') || t.includes('essential')) return 'shop';
  if (t.includes('out') || t.includes('explore') || t.includes('about')) return 'explore';
  if (t.includes('cycl') || t.includes('ride')) return 'bike';
  if (t.includes('run')) return 'run';
  if (t.includes('walk')) return 'explore';
  if (t.includes('route') || t.includes('guide') || t.includes('komoot') || t.includes('direction') || t.includes('finding')) return 'compass';
  if (t.includes('arrival') || t.includes('key')) return 'key';
  if (t.includes('wi-fi') || t.includes('wifi')) return 'wifi';
  if (t.includes('kitchen') || t.includes('appliance') || t.includes('cooker') || t.includes('oven') || t.includes('hob')) return 'kitchen';
  if (t.includes('welcome pack')) return 'gift';
  if (t.includes('tv') || t.includes('entertainment')) return 'tv';
  if (t.includes('drying') || t.includes('wet gear') || t.includes('shower') || t.includes('bathroom')) return 'droplet';
  if (t.includes('bin') || t.includes('recycl')) return 'bin';
  if (t.includes('parking')) return 'parking';
  if (t.includes('bike') || t.includes('luggage')) return 'bike';
  if (t.includes('before you leave') || t.includes('check-out') || t.includes('leave')) return 'leave';
  if (t.includes('help') || t.includes('emergenc')) return 'help';
  return 'info';
}

// Build one collapsible card. `bodyNode` is a DOM node with the card contents.
export function makeCard(title, bodyNode, open) {
  const card = document.createElement('details');
  card.className = 'gcard';
  if (open) card.open = true;

  const head = document.createElement('summary');
  head.className = 'gcard-head';

  const icon = document.createElement('span');
  icon.className = 'gcard-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(svg(ICONS[iconKeyFor(title)] || ICONS.info));
  head.appendChild(icon);

  head.appendChild(el('span', 'gcard-title', title));

  const chev = svg(CHEVRON, 'gcard-chevron');
  chev.setAttribute('aria-hidden', 'true');
  head.appendChild(chev);

  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'gcard-body';
  body.appendChild(bodyNode);
  card.appendChild(body);
  return card;
}

// Renders a grouped listing section ({ intro, groups:[{name, items}] }).
export function renderArea(area) {
  const wrap = document.createDocumentFragment();
  if (area.intro) wrap.appendChild(el('p', 'guide-intro', area.intro));
  const cards = el('div', 'guide-cards');
  (area.groups || []).forEach((group, i) => {
    const body = document.createDocumentFragment();
    (group.items || []).forEach((item) => {
      const it = el('div', 'area-item');
      it.appendChild(el('div', 'area-item-name', item.name));
      if (item.meta) it.appendChild(el('div', 'area-item-meta', item.meta));
      if (item.note) it.appendChild(el('div', 'area-item-note', item.note));
      if (item.link && /^https?:\/\//.test(item.link)) {
        const a = document.createElement('a');
        a.className = 'area-item-link';
        a.href = item.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = item.linkLabel || 'Visit website ↗';
        it.appendChild(a);
      }
      body.appendChild(it);
    });
    cards.appendChild(makeCard(group.name, body, i === 0));
  });
  wrap.appendChild(cards);
  return wrap;
}

// Renders a property manual ({ tagline, sections:[{title, body, items, fields}] }).
export function renderProperty(prop) {
  const wrap = document.createDocumentFragment();
  if (prop.tagline) wrap.appendChild(el('div', 'guide-property-tagline', prop.tagline));
  const cards = el('div', 'guide-cards');
  (prop.sections || []).forEach((sec, i) => {
    const body = document.createDocumentFragment();
    if (sec.body) body.appendChild(el('p', 'gcard-text', sec.body));
    if (Array.isArray(sec.items) && sec.items.length) {
      const ul = el('ul', 'manual-list');
      sec.items.forEach((li) => {
        if (typeof li === 'string') {
          ul.appendChild(el('li', null, li));
          return;
        }
        const item = el('li', null, li.text || '');
        if (li.link && /^https?:\/\//.test(li.link)) {
          item.appendChild(document.createElement('br'));
          const a = document.createElement('a');
          a.className = 'manual-link';
          a.href = li.link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = li.linkLabel || 'More ↗';
          item.appendChild(a);
        }
        ul.appendChild(item);
      });
      body.appendChild(ul);
    }
    if (Array.isArray(sec.fields) && sec.fields.length) {
      const fw = el('div', 'manual-fields');
      sec.fields.forEach((f) => {
        const row = el('div', 'manual-field');
        row.appendChild(el('span', 'manual-field-label', f.label));
        row.appendChild(el('span', 'manual-field-value', f.value));
        fw.appendChild(row);
      });
      body.appendChild(fw);
    }
    cards.appendChild(makeCard(sec.title, body, i === 0));
  });
  wrap.appendChild(cards);
  return wrap;
}
