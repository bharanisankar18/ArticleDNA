const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|ref|ref_src|_hsenc|_hsmi|mkt_tok)$/i;

/** A stable key for "the same article": no fragment, no tracking parameters, no trailing slash. */
export function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const query = url.searchParams.toString();
    return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return raw;
  }
}

/** Host with port, for display ("localhost:8000"). */
export function hostOf(raw: string): string {
  try {
    return new URL(raw).host.replace(/^www\./, '');
  } catch {
    return raw;
  }
}
