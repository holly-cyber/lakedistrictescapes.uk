import { getStore } from '@netlify/blobs';

// Netlify Function (v2) — Guest book API for Lake District Escapes.
//
//   GET  /api/guestbook   → { entries: [...] }  (newest first)
//   POST /api/guestbook   → { ok: true, entry }  (add a signing)
//
// Entries are persisted in Netlify Blobs under a single JSON key. This keeps
// reads to one round-trip and is more than sufficient for a low-traffic
// guest book.

const STORE_NAME = 'guestbook';
const KEY = 'entries';
const MAX_ENTRIES = 500; // hard cap kept in storage
const MAX_NAME = 60;
const MAX_MESSAGE = 800;
const MAX_STAY = 80;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function clean(str, max) {
  return String(str ?? '')
    // collapse whitespace/newlines, drop ASCII control chars
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

async function readEntries(store) {
  const data = await store.get(KEY, { type: 'json' });
  return Array.isArray(data) ? data : [];
}

export default async (req) => {
  const store = getStore(STORE_NAME);

  if (req.method === 'GET') {
    try {
      const entries = await readEntries(store);
      // Newest first, only approved entries exposed publicly.
      const publicEntries = entries
        .filter((e) => e.approved !== false)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return json({ entries: publicEntries, count: publicEntries.length });
    } catch (err) {
      return json({ error: 'Unable to load the guest book right now.' }, 500);
    }
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }

    // Honeypot — real users never fill this in.
    if (clean(body.website, 200)) {
      return json({ ok: true }); // silently accept & drop
    }

    const name = clean(body.name, MAX_NAME);
    const message = clean(body.message, MAX_MESSAGE);
    const stay = clean(body.stay, MAX_STAY); // e.g. "The Rockery, Aug 2026"
    const location = clean(body.location, MAX_STAY);
    let rating = parseInt(body.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) rating = 5;

    if (name.length < 2) {
      return json({ error: 'Please tell us your name.' }, 400);
    }
    if (message.length < 4) {
      return json({ error: 'Please leave a short message.' }, 400);
    }

    // Stored as raw (control-stripped) text. The web client renders every
    // field with textContent, never innerHTML, so it is escaped at display
    // time — this avoids storing double-escaped entities.
    const entry = {
      id: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      message,
      stay,
      location,
      rating,
      approved: true, // shown immediately; owner can moderate in the blob store
      createdAt: Date.now(),
    };

    try {
      const entries = await readEntries(store);
      entries.push(entry);
      // Keep storage bounded.
      const trimmed = entries.slice(-MAX_ENTRIES);
      await store.setJSON(KEY, trimmed);
      return json({ ok: true, entry }, 201);
    } catch (err) {
      return json({ error: 'Sorry — we could not save your message.' }, 500);
    }
  }

  return json({ error: 'Method not allowed.' }, 405);
};

export const config = {
  path: '/api/guestbook',
};
