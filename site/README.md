# Lake District Escapes

Marketing site for **Lake District Escapes** — a family-run holiday house & cottage
business in Shap, Cumbria. Built with [Astro](https://astro.build) and deployed on
[Netlify](https://www.netlify.com).

## What's here

| Page | Route | Purpose |
| --- | --- | --- |
| **Master home** | `/` | Brand home page introducing both properties |
| **The Rockery** | `/the-rockery/` | Standalone landing page — Grade II Listed house, sleeps 10 |
| **Primrose Cottage** | `/primrose-cottage/` | Standalone landing page — cottage for two |
| **Guest book** | `/guest/` | Public guest book (also served on the `guest.` sub-domain) |
| **Thank you** | `/thank-you/` | Post-enquiry confirmation |

Short URLs `/rockery` and `/cottage` redirect to the full property pages.

## Project structure

The `netlify.toml` lives at the **repository root** (one level up from `site/`)
because Netlify only auto-reads its config from the repo root. It sets
`base = "site"` so the build runs inside this directory.

```
netlify.toml                   # (repo root) Netlify build, redirects, headers, functions
site/
├── astro.config.mjs          # Astro config (static output)
├── public/
│   ├── images/               # Property photography (extracted from the original mockup)
│   └── favicon.svg
├── src/
│   ├── layouts/Base.astro     # <head>, fonts, nav/footer slots, shared scripts
│   ├── components/            # Nav.astro, Footer.astro
│   ├── styles/global.css      # The shared "Lake District" design system
│   └── pages/                 # index, the-rockery, primrose-cottage, guest/, thank-you
└── netlify/
    ├── functions/guestbook.mjs        # Guest book API (GET/POST) — Netlify Blobs
    └── edge-functions/subdomain-router.js  # Routes guest.* → /guest/
```

## Local development

```bash
cd site
npm install
npm run dev        # http://localhost:4321
```

To exercise the guest book API and edge routing locally you need the Netlify CLI
(it runs the functions + blobs sandbox that `npm run dev` alone does not):

```bash
npm i -g netlify-cli
netlify dev
```

Build the production site with `npm run build` (output in `dist/`).

## The guest book

- **Frontend:** `src/pages/guest/index.astro` — a static page whose client script
  fetches existing entries and posts new ones. All user text is rendered with
  `textContent` (never `innerHTML`), so it is escaped at display time.
- **Backend:** `netlify/functions/guestbook.mjs` — a Netlify Function exposed at
  `/api/guestbook`.
  - `GET` → returns approved entries, newest first.
  - `POST` → validates and stores a new signing.
  - Spam protection: a hidden honeypot field + length limits.
  - Storage: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (key
    `entries` in the `guestbook` store) — no external database required.
- **Moderation:** entries are shown immediately with `approved: true`. To hide an
  entry, edit the stored JSON in the Netlify Blobs UI and set its `approved` flag
  to `false` (or delete it).

## The `guest.` sub-domain

The same deploy serves the guest book on a dedicated sub-domain so you can share a
clean link like `guest.lakedistrictescapes.uk`.

1. **DNS** — add a CNAME record:
   `guest` → `<your-site-name>.netlify.app`
2. **Netlify** — in *Domain management*, add `guest.lakedistrictescapes.uk` as a
   **domain alias** of this site.
3. The edge function `subdomain-router.js` detects the `guest.` host and serves
   `/guest/` at the sub-domain root. All other paths (assets, `/api/guestbook`)
   pass straight through, so they keep working on both domains.

## Enquiry forms

The enquiry forms use [Netlify Forms](https://docs.netlify.com/forms/setup/)
(`data-netlify="true"`) — submissions appear in the Netlify dashboard and can be
forwarded to email with no backend code. Each form has a honeypot (`bot-field`)
for spam protection and redirects to `/thank-you/` on success.

## Deploying

Connect the repository to Netlify. Because the Astro project lives in the `site/`
sub-directory, the settings are declared in the root `netlify.toml` and applied
automatically — no manual configuration needed:

- **Base directory:** `site`
- **Build command:** `npm run build`
- **Publish directory:** `dist` (i.e. `site/dist`)

Netlify auto-detects the functions and edge functions from `site/netlify/`.

> **Note:** the site is served from the `main` branch. The production URL only
> shows this site once these changes are merged to `main` (or you point the
> project's production branch at the feature branch).

## Design system

The palette and typography come from the original mockup — a Cumbria-inspired set
of greens, slates and Coniston blues (see the `:root` custom properties at the top
of `src/styles/global.css`), paired with Playfair Display + DM Sans.
