/**
 * Turns the nav registry into the list of doc URLs to fetch.
 *
 * Everything here derives from `DOCS_ROOT`, never from a hardcoded framework
 * slug — that is what makes this directory a pure copy when porting to the
 * other framework repos.
 *
 * Pure: no fs, no network. Safe on either side of the server boundary.
 */

import { ALL_ROUTES, DOCS_ROOT, type RouteMeta } from "../nav-config";

/** `https://docs.copilotkit.ai` */
export function docsOrigin(): string {
  return new URL(DOCS_ROOT).origin;
}

/** `/langgraph-python` — the prefix that scopes this repo's slice of the sitemap. */
export function docsRootPathname(): string {
  return stripTrailingSlash(new URL(DOCS_ROOT).pathname);
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

/**
 * Strips query strings and fragments off a `RouteMeta.docPath`.
 *
 * Not cosmetic. `docPath` legitimately carries UI state — one entry is
 * `/langgraph-python/quickstart?agent=bring-your-own`, which selects a tab on
 * the doc page. Appending `.md` to that verbatim produces
 * `…/quickstart?agent=bring-your-own.md`, and the docs site answers that with
 * `200 text/html` — the SPA shell, not the page source. Normalizing here is
 * what stops a snapshot being silently overwritten with HTML; the content-type
 * assertion in `fetch-docs.ts` is the second line of defence.
 */
export function normalizeDocPath(docPath: string): string {
  const withoutQuery = docPath.split(/[?#]/, 1)[0];
  return stripTrailingSlash(withoutQuery);
}

/** Only characters we are willing to turn into a filename. */
const SAFE_DOC_PATH = /^\/[A-Za-z0-9/_.-]*$/;

export function isSafeDocPath(docPath: string): boolean {
  return SAFE_DOC_PATH.test(docPath) && !docPath.includes("..");
}

/** The raw-markdown URL for a normalized docPath. */
export function docPathToUrl(docPath: string): string {
  return `${docsOrigin()}${docPath}.md`;
}

/**
 * `/langgraph-python/backend/ag-ui` → `langgraph-python__backend__ag-ui`
 *
 * Flat rather than nested so a page disappearing never leaves an empty
 * directory behind, and so "which snapshot files are orphaned" is a set
 * difference against the manifest rather than a tree walk.
 */
export function docPathToSlug(docPath: string): string {
  return docPath.replace(/^\//, "").replace(/\//g, "__");
}

export interface DocTarget {
  /** Normalized, query-free. The manifest key. */
  docPath: string;
  url: string;
  slug: string;
  file: string;
  /** Every nav route pointing here — a doc page can back more than one route. */
  routes: string[];
  /** The first route's title, for display. */
  title: string;
}

/**
 * The corpus: one entry per *unique* doc page, not per route.
 *
 * In this repo 36 nav routes collapse to 34 targets — `/` and `/status` share
 * the framework root, and the two quickstart entries differ only by the tab
 * query string. Fetching per route would double-fetch and then diff a page
 * against itself.
 */
export function docTargets(routes: readonly RouteMeta[] = ALL_ROUTES): DocTarget[] {
  const byPath = new Map<string, DocTarget>();

  for (const route of routes) {
    const docPath = normalizeDocPath(route.docPath);
    if (!isSafeDocPath(docPath)) continue;

    const existing = byPath.get(docPath);
    if (existing) {
      existing.routes.push(route.path);
      continue;
    }

    const slug = docPathToSlug(docPath);
    byPath.set(docPath, {
      docPath,
      url: docPathToUrl(docPath),
      slug,
      file: `${slug}.md`,
      routes: [route.path],
      title: route.title,
    });
  }

  return [...byPath.values()].sort((a, b) => a.docPath.localeCompare(b.docPath));
}

/** Nav routes whose `docPath` we refuse to fetch — surfaced rather than skipped silently. */
export function unsafeDocPaths(routes: readonly RouteMeta[] = ALL_ROUTES): string[] {
  return routes
    .map((r) => normalizeDocPath(r.docPath))
    .filter((p) => !isSafeDocPath(p));
}
