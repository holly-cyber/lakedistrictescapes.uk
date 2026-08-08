// @ts-check
import { defineConfig } from 'astro/config';

// The site is fully static — all pages are prerendered to HTML.
// The dynamic guest book is powered by a standalone Netlify Function
// (netlify/functions/guestbook.mjs) backed by Netlify Blobs, so no
// server adapter is required here.
export default defineConfig({
  site: 'https://lakedistrictescapes.uk',
  output: 'static',
  build: {
    format: 'directory',
  },
});
