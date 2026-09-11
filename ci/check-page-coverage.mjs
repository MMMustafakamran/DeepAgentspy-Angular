#!/usr/bin/env node
/**
 * Close the manifest -> route -> recorder gap.
 *
 * The doc-drift check knows which upstream pages are tracked; the recorder
 * knows which demo routes it records; PAGE_GROUPS knows which recorder pages
 * the dispatch form can reach. Nothing used to check that those three lists
 * agree, so a doc page could be snapshotted with a route that no recorder
 * entry ever opens, and a recorder entry could exist that no checkbox reaches.
 *
 * Three checks, all read textually (no tsx / TypeScript import chain):
 *
 *   1. every `manifest.pages[docPath].routes[]` is non-empty;
 *   2. every manifest route is opened by some recorder entry -- a recorder
 *      `route:` / `demoUrl:` / `docUrl:` path that equals the route or sits
 *      under it (`/threads` is covered by `/threads/drawer`, not by
 *      `/threads-lifecycle`). `/`, `/doc-sync` and anything listed in the
 *      optional `manifest.coverage.ignoreRoutes` array are exempt;
 *   3. every recorder page id appears in exactly one PAGE_GROUPS group
 *      (`assertGroupsCoverAllPages` from ci/lib/pages.mjs).
 *
 * Prints a table and exits 1 on any gap, 0 when clean. `--json` prints the
 * same result as machine output. Also imported by check-doc-drift.mjs, which
 * prints the table as a non-fatal section of its own run.
 *
 *   node ci/check-page-coverage.mjs
 *   node ci/check-page-coverage.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORDER_DIR, ROOT_DIR } from './lib/config.mjs';
import { assertGroupsCoverAllPages, readPageIds } from './lib/pages.mjs';

const MANIFEST_PATH = path.join(ROOT_DIR, 'doc-snapshot', 'manifest.json');
const PAGES_CONFIG = path.join(RECORDER_DIR, 'config', 'pages.config.ts');

const ALWAYS_IGNORED = ['/', '/doc-sync'];

/** `quickstart`, `/quickstart/`, `http://localhost:3000/quickstart?x` -> `/quickstart`. */
export function normalizeRoutePath(raw) {
  let p = String(raw ?? '').trim();
  if (/^[a-z]+:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      // keep as-is; it will simply fail to match
    }
  }
  p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

function isUnderRoute(candidate, route) {
  if (route === '/') return true;
  return candidate === route || candidate.startsWith(`${route}/`);
}

/**
 * The recorder's page entries, keyed by id, with every path-bearing string
 * (`route:`, `demoUrl:`, `docUrl:`) found between one `id:` line and the next.
 * Same textual approach as ci/lib/pages.mjs; both quote styles accepted, and a
 * template-literal id (`demo-${pm}`) starts a block that is attributed to
 * `<unquoted>` rather than dropped, so its route still counts as recorded.
 */
export function readRecorderEntries(src = fs.readFileSync(PAGES_CONFIG, 'utf8')) {
  const lines = src.split(/\r?\n/);
  const entries = [];
  let current = null;

  const idRe = /^\s*id:\s*(?:['"]([^'"]+)['"]|`([^`]+)`)/;
  const pathRe = /^\s*(route|demoUrl|docUrl)\s*:\s*['"`]([^'"`]+)['"`]/;

  for (const line of lines) {
    const id = line.match(idRe);
    if (id) {
      current = { id: id[1] ?? `<unquoted:${id[2]}>`, quoted: Boolean(id[1]), paths: [] };
      entries.push(current);
      continue;
    }
    const p = line.match(pathRe);
    if (p && current) current.paths.push({ key: p[1], path: normalizeRoutePath(p[2]) });
  }
  return entries;
}

export function checkPageCoverage({ manifest, configSource } = {}) {
  const m = manifest ?? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = readRecorderEntries(configSource);
  const ignored = new Set([
    ...ALWAYS_IGNORED,
    ...(Array.isArray(m.coverage?.ignoreRoutes) ? m.coverage.ignoreRoutes : []).map(normalizeRoutePath),
  ]);

  // Quoted (real) page ids first so a match names the recorder page, not a
  // template-literal helper block that happens to share the route.
  const recorderPaths = [...entries]
    .sort((a, b) => Number(b.quoted) - Number(a.quoted))
    .flatMap((e) => e.paths.map((p) => ({ ...p, id: e.id })));

  const rows = [];
  const gaps = [];

  // 1 + 2: manifest side.
  for (const [docPath, meta] of Object.entries(m.pages ?? {})) {
    const routes = Array.isArray(meta?.routes) ? meta.routes.filter(Boolean) : [];
    if (routes.length === 0) {
      rows.push({ docPath, route: '-', recorder: '-', status: 'NO ROUTE' });
      gaps.push({ kind: 'no-route', docPath, message: `doc page has no route: ${docPath}` });
      continue;
    }
    for (const rawRoute of routes) {
      const route = normalizeRoutePath(rawRoute);
      if (ignored.has(route)) {
        rows.push({ docPath, route, recorder: '-', status: 'exempt' });
        continue;
      }
      const hit = recorderPaths.find((p) => isUnderRoute(p.path, route));
      if (hit) {
        rows.push({ docPath, route, recorder: `${hit.id} (${hit.key}: ${hit.path})`, status: 'ok' });
      } else {
        rows.push({ docPath, route, recorder: '-', status: 'NO RECORDER' });
        gaps.push({
          kind: 'no-recorder',
          docPath,
          route,
          message: `manifest route has no recorder entry: ${route} (${docPath})`,
        });
      }
    }
  }

  // 3: recorder side. assertGroupsCoverAllPages throws one message naming
  // every problem; it is re-run here so the table can carry the verdict.
  let groups = { ok: true, message: '' };
  try {
    assertGroupsCoverAllPages();
  } catch (err) {
    groups = { ok: false, message: err.message };
    gaps.push({ kind: 'ungrouped', message: err.message });
  }

  let pageIds = [];
  try {
    pageIds = readPageIds();
  } catch (err) {
    gaps.push({ kind: 'config-unreadable', message: err.message });
  }

  return {
    ok: gaps.length === 0,
    manifestPages: Object.keys(m.pages ?? {}).length,
    recorderPages: pageIds.length,
    rows,
    groups,
    gaps,
  };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function formatCoverageTable(result) {
  const out = [];
  out.push(
    `🧭 Page coverage: ${result.manifestPages} manifest page(s), ${result.recorderPages} recorder page(s), ` +
      `${result.gaps.length} gap(s).`,
  );
  const w = {
    route: Math.max(5, ...result.rows.map((r) => r.route.length)),
    status: Math.max(6, ...result.rows.map((r) => r.status.length)),
  };
  out.push(`   ${pad('route', w.route)}  ${pad('status', w.status)}  recorder entry`);
  out.push(`   ${'-'.repeat(w.route)}  ${'-'.repeat(w.status)}  --------------`);
  for (const r of result.rows) {
    const mark = r.status === 'ok' ? ' ' : r.status === 'exempt' ? ' ' : '!';
    out.push(`  ${mark}${pad(r.route, w.route)}  ${pad(r.status, w.status)}  ${r.recorder}`);
  }
  out.push(
    result.groups.ok
      ? '   PAGE_GROUPS: every recorder page id is grouped.'
      : `   PAGE_GROUPS: ${result.groups.message.split('\n').join('\n                ')}`,
  );
  if (result.gaps.length > 0) {
    out.push('');
    out.push('   Gaps:');
    for (const g of result.gaps) out.push(`   • [${g.kind}] ${g.message.split('\n')[0]}`);
  }
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json');
  let result;
  try {
    result = checkPageCoverage();
  } catch (err) {
    if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
    else console.error(`❌ ${err.message}`);
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatCoverageTable(result));
    console.log(result.ok ? '\n✅ [PAGE COVERAGE] manifest, recorder and dispatch groups agree.' : '\n❌ [PAGE COVERAGE GAPS] see table above.');
  }
  process.exit(result.ok ? 0 : 1);
}
