// Edge Function — host-based routing for the guest sub-domains.
//
//   guest.lakedistrictescapes.uk    → /guest/         (area + walks public,
//                                                       property manual gated)
//   cottage.lakedistrictescapes.uk  → /cottage-guide/ (everything gated —
//                                                       fully private for guests)
//   management.lakedistrictescapes.uk → /management/   (private owner dashboard)
//   schedule.lakedistrictescapes.uk → /schedule/     (cleaner/gardener dates)
//
// Only the site root ("/") is rewritten, so assets (/images/*, CSS, JS) and the
// API (/api/*) keep resolving normally on the sub-domains. On the apex/www
// domain this does nothing.
export default async (request, context) => {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || '').toLowerCase();
  const atRoot = url.pathname === '/' || url.pathname === '/index.html';

  if (!atRoot) return context.next();

  if (host.startsWith('management.')) {
    return context.rewrite('/management/');
  }
  if (host.startsWith('schedule.')) {
    return context.rewrite('/schedule/');
  }
  if (host.startsWith('cottage.')) {
    return context.rewrite('/cottage-guide/');
  }
  if (host.startsWith('guest.')) {
    return context.rewrite('/guest/');
  }

  return context.next();
};

export const config = {
  path: '/',
};
