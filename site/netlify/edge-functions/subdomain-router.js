// Edge Function — serves the guest book as the landing page for the
// `guest.` sub-domain (e.g. guest.lakedistrictescapes.uk).
//
// It only rewrites the site root ("/") so that assets (/images/*, CSS) and
// the API (/api/guestbook) continue to resolve normally on the sub-domain.
// On the apex/www domain it does nothing.
export default async (request, context) => {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || '').toLowerCase();

  const isGuestSubdomain = host.startsWith('guest.');

  if (isGuestSubdomain && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Serve the /guest/ page at the sub-domain root without changing the URL.
    return context.rewrite('/guest/');
  }

  // Everything else passes straight through.
  return context.next();
};

export const config = {
  path: '/',
};
