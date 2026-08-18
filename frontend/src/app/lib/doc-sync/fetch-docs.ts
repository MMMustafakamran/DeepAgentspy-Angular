import { docsOrigin, docsRootPathname, type DocTarget } from "./paths";
import { normalizeText } from "./store";

/**
 * Pulls the raw markdown behind each doc page, plus the sitemap.
 *
 * The docs site serves the authored MDX for any page when you append `.md` to
 * its URL — 4-13 KB of source instead of 257 KB of rendered HTML, which is why
 * this feature can diff meaningfully at all. That behaviour is undocumented
 * and unversioned, so every response is validated structurally before it is
 * allowed anywhere near the snapshot (see `looksLikeMarkdown`).
 *
 * Nothing here throws. Every failure comes back as a typed result, matching
 * the convention in `lib/source.ts` and `app/status/page.tsx`.
 */

/**
 * Enough parallelism to keep the run short, low enough to stay polite.
 *
 * Run duration is the actual variable that matters: responses are cached for
 * 60s with no ETag, so a deploy landing mid-run can serve some pages from the
 * old build and some from the new. A four-second run has a far smaller window
 * for that than a forty-second one — which is the real argument against
 * dialing this down further.
 */
const CONCURRENCY = 6;

/** Generous next to the 2.5s used for localhost health checks — this is a CDN. */
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_BUDGET_MS = 60_000;

/**
 * Only an empty body is treated as structurally wrong.
 *
 * A byte-count floor looks like cheap soft-404 detection and is not: plenty of
 * real doc pages are a heading and one MDX include — `/agno/generative-ui/
 * your-components/interactive` is 131 bytes of entirely valid content. A
 * threshold generous enough to reject a soft 404 also rejects those, and the
 * run aborts on a page that was fine. The content-type and HTML checks already
 * catch the failure this was reaching for, and the markdown endpoint answers
 * genuinely missing pages with a real 404.
 */
const MIN_BODY_BYTES = 1;

export interface FetchedPage {
  target: DocTarget;
  status: number;
  text?: string;
  age?: number;
  date?: string;
  /** Set for anything that is not a clean 200 or a clean 404. */
  error?: string;
  /** True when the response failed structural validation — poisons the run. */
  structural?: boolean;
}

/**
 * The failure mode this exists to prevent: a URL that misses the markdown
 * handler still answers `200`, with the app shell as `text/html`. Writing that
 * into the snapshot would destroy the baseline *and* report every page as
 * rewritten on the next run. Confirmed live against
 * `/langgraph-python/quickstart?agent=bring-your-own.md`, which returns
 * `200 text/html` — hence the query stripping in `paths.ts` as well.
 */
function looksLikeMarkdown(
  contentType: string | null,
  body: string,
): { ok: true } | { ok: false; error: string } {
  const type = (contentType ?? "").toLowerCase();
  if (!type.startsWith("text/markdown") && !type.startsWith("text/plain")) {
    return { ok: false, error: `expected markdown, got content-type "${contentType ?? "none"}"` };
  }

  const head = body.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    return { ok: false, error: "response body is HTML, not markdown" };
  }

  if (body.trim().length < MIN_BODY_BYTES) {
    return { ok: false, error: "empty response body" };
  }

  return { ok: true };
}

async function fetchOnce(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    cache: "no-store",
    headers: { accept: "text/markdown, text/plain" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  });
}

async function fetchPage(target: DocTarget, signal: AbortSignal): Promise<FetchedPage> {
  // One retry, and deliberately not on 404 — a missing page is a finding worth
  // reporting, not a transient failure worth papering over.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchOnce(target.url, signal);

      if (res.status === 404) {
        return { target, status: 404 };
      }

      if (!res.ok) {
        if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
          await backoff(attempt, signal);
          continue;
        }
        return { target, status: res.status, error: `HTTP ${res.status}` };
      }

      const body = await res.text();
      const shape = looksLikeMarkdown(res.headers.get("content-type"), body);
      if (!shape.ok) {
        return { target, status: res.status, error: shape.error, structural: true };
      }

      const age = Number(res.headers.get("age"));
      return {
        target,
        status: res.status,
        text: normalizeText(body),
        age: Number.isFinite(age) ? age : undefined,
        date: res.headers.get("date") ?? undefined,
      };
    } catch (error) {
      if (attempt === 0 && !signal.aborted) {
        await backoff(attempt, signal);
        continue;
      }
      return { target, status: 0, error: describe(error) };
    }
  }

  return { target, status: 0, error: "exhausted retries" };
}

function backoff(attempt: number, signal: AbortSignal): Promise<void> {
  // Jittered so a wave of retries does not re-collide.
  const delay = 300 * (attempt + 1) + Math.floor(Math.random() * 200);
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delay);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Fixed-size worker pool over a shared cursor. Preserves input order in the output. */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export interface FetchRun {
  pages: FetchedPage[];
  durationMs: number;
  /** Set when a response failed structural validation — the caller must not commit. */
  structuralFailure?: string;
}

export async function fetchAllPages(targets: DocTarget[]): Promise<FetchRun> {
  const started = Date.now();
  const budget = AbortSignal.timeout(RUN_BUDGET_MS);

  const pages = await pool(targets, CONCURRENCY, (target) => fetchPage(target, budget));
  const structural = pages.find((p) => p.structural);

  return {
    pages,
    durationMs: Date.now() - started,
    structuralFailure: structural
      ? `${structural.target.docPath}: ${structural.error}`
      : undefined,
  };
}

/**
 * Re-reads only the pages that reported a change.
 *
 * Two reads seconds apart can straddle a deploy, since the CDN caches for 60s
 * and exposes no build id to correlate against. Confirming just the changed
 * pages is typically 0-4 extra requests, and it converts "this diff might be
 * an artefact of a deploy landing mid-run" into a page explicitly marked
 * unstable and held back from the commit.
 */
export async function confirmChanged(
  targets: DocTarget[],
): Promise<Map<string, FetchedPage>> {
  if (targets.length === 0) return new Map();

  const budget = AbortSignal.timeout(RUN_BUDGET_MS);
  const pages = await pool(targets, CONCURRENCY, (target) => fetchPage(target, budget));
  return new Map(pages.map((p) => [p.target.docPath, p]));
}

export interface SitemapResult {
  urls: string[];
  urlsUnderRoot: number;
  error?: string;
}

/**
 * Every URL the docs site publishes under this framework's prefix.
 *
 * Parsed with a regex on purpose: this is machine-generated XML with one tag
 * we care about, and an XML parser would be a dependency in fourteen repos for
 * no gain.
 *
 * `lastmod` is deliberately ignored. It looks like exactly the change signal
 * this feature wants, but 3505 of the sitemap's 3543 entries carry an
 * identical timestamp — it is the site's build stamp, not a per-page
 * modification time. Using it would make the whole feature silently blind.
 */
export async function fetchSitemap(): Promise<SitemapResult> {
  const prefix = `${docsOrigin()}${docsRootPathname()}/`;

  try {
    const res = await fetch(`${docsOrigin()}/sitemap.xml`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { urls: [], urlsUnderRoot: 0, error: `HTTP ${res.status}` };

    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].trim())
      .filter((u) => u.startsWith(prefix));

    return { urls, urlsUnderRoot: urls.length };
  } catch (error) {
    return { urls: [], urlsUnderRoot: 0, error: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
