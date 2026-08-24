/**
 * Analytics, in one file and behind one function.
 *
 * Three rules, and the second is the one this page has to be strictest about.
 *
 * **It never runs off the deployed host.** A dev server and a `file://` open are not visits, and a
 * property polluted by the author's own sixty reloads an afternoon is a property nobody trusts
 * three months later. The host check is here rather than in an environment variable because a
 * build flag that is wrong is silent, and this is not.
 *
 * **Nothing about the face, and nothing anybody typed, is ever sent.** The page promises that what
 * you draw here does not leave the tab, and that promise is worth more than any number. So: no
 * design string, no axis values, no font name, no specimen text — the `t` and `f` parameters in the
 * URL are the entire design and the entire typed line, and neither is ever a parameter here. What
 * is sent is bounded enumerations chosen from lists in this repo — which of four families, which of
 * twenty-one styles, which of thirteen alternates — plus small counts. The page counts what
 * happened, not what was made.
 *
 * **It cannot break the page.** The script is loaded async and every call goes through a queue that
 * works whether or not it ever arrives, so a blocked request or an ad blocker costs nothing, and
 * `track` is silent and free when analytics is off — which is every local run. Call sites never
 * have to ask, so a call site that forgot to ask cannot become a bug.
 */

/**
 * The GA4 measurement ID. Empty disables the whole module — which is what a fork of this repo
 * should get, rather than somebody else's numbers.
 */
const MEASUREMENT_ID = '';

/** The only host that reports. */
const HOST = 'punchcutter.plausible.ventures';

type Params = Readonly<Record<string, string | number | boolean>>;

interface Gtag {
  (command: 'js', at: Date): void;
  (command: 'config', id: string, params?: Params): void;
  (command: 'event', name: string, params?: Params): void;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let live = false;

export function startAnalytics(): void {
  if (MEASUREMENT_ID === '' || typeof window === 'undefined') return;
  if (window.location.hostname !== HOST) return;

  window.dataLayer = window.dataLayer ?? [];
  const gtag: Gtag = ((...args: unknown[]) => {
    // The documented shape: gtag pushes `arguments` itself, not an array, and the tag reads it back
    // as an arguments object. Spreading it into an array here would be quietly ignored.
    window.dataLayer?.push(args);
  }) as Gtag;
  window.gtag = gtag;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);

  gtag('js', new Date());
  // The design and the specimen line live in the URL fragment, which GA4 does not collect — but
  // saying so explicitly is cheaper than trusting that it never will. The page path is all that
  // identifies this page, and there is only one of them.
  gtag('config', MEASUREMENT_ID, { page_location: `https://${HOST}/`, page_path: '/' });
  live = true;
}

/** Record something that happened. Silent and free when analytics is off. */
export function track(event: string, params: Params = {}): void {
  if (!live) return;
  window.gtag?.('event', event, params);
}
