import { DOCS_ROOT } from "../nav-config";

import { mergeChangelog, renderRun } from "./changelog";
import { diffDocument } from "./diff";
import { confirmChanged, fetchAllPages, fetchSitemap, type FetchedPage } from "./fetch-docs";
import { docTargets, type DocTarget } from "./paths";
import {
  commitSnapshot,
  readChangelog,
  readManifest,
  readSnapshotPage,
  sha256,
  writeChangelog,
  writeReport,
  type SnapshotWrite,
} from "./store";
import {
  maxSeverity,
  type DocSyncReport,
  type Manifest,
  type ManifestPage,
  type PageOutcome,
  type PageReport,
  type Severity,
  type SitemapFinding,
  type SyncResult,
} from "./types";

/**
 * The whole sync, behind one call.
 *
 * Server-side only: it fetches over the network and writes to disk, so it is
 * imported exclusively from `src/server.ts` and never reaches the browser
 * bundle. The Angular page talks to it over `/api/doc-sync` instead — there is
 * no server-action equivalent here, so the boundary is an HTTP endpoint.
 */

/** Coalesces overlapping runs — the endpoint is reachable without the button. */
let inFlight: Promise<SyncResult> | null = null;

export async function runDocSync(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = execute().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function enabled(): boolean {
  // Locally this is a developer tool and should just work. Deployed, it is an
  // unauthenticated endpoint performing outbound fetches and disk writes, so it
  // stays off unless switched on deliberately.
  return process.env["NODE_ENV"] !== "production" || process.env["DOC_SYNC_ENABLE"] === "1";
}

async function execute(): Promise<SyncResult> {
  if (!enabled()) {
    return {
      ok: false,
      baseline: false,
      message: "Doc sync is disabled in production. Set DOC_SYNC_ENABLE=1 to allow it.",
      changed: 0,
      highest: "none",
    };
  }

  const ranAt = new Date().toISOString();
  const targets = docTargets();
  const manifestState = await readManifest();

  if (manifestState.kind === "error") {
    return abort(ranAt, `Could not read the manifest: ${manifestState.error}`, targets.length);
  }

  const baseline = manifestState.kind === "absent";
  const previous = manifestState.kind === "ok" ? manifestState.manifest : null;

  const run = await fetchAllPages(targets);

  // Structural failure means the `.md` contract itself broke and we are holding
  // HTML. Committing would overwrite every snapshot with garbage and then
  // report the whole corpus as rewritten next run.
  if (run.structuralFailure) {
    return abort(
      ranAt,
      `Upstream did not return markdown (${run.structuralFailure}). Snapshot left untouched.`,
      targets.length,
      run.durationMs,
    );
  }

  // All-or-nothing: a partially written snapshot makes the *next* run's diff
  // lie about the pages that were skipped, and does it silently.
  const failed = run.pages.filter((p) => p.error && p.status !== 404);
  if (failed.length > 0) {
    const detail = failed
      .slice(0, 3)
      .map((p) => `${p.target.docPath} (${p.error})`)
      .join(", ");
    return abort(
      ranAt,
      `${failed.length} page(s) failed to fetch: ${detail}. Snapshot left untouched.`,
      targets.length,
      run.durationMs,
    );
  }

  const byPath = new Map(run.pages.map((p) => [p.target.docPath, p]));

  /**
   * The stored *bodies*, read back before anything is compared.
   *
   * The manifest's `sha256` records what was written, not what is on disk now.
   * Trusting it would make a snapshot edited or corrupted locally invisible —
   * its recorded hash still matches upstream, so the page reads as unchanged
   * and the next write quietly restores it.
   */
  const stored = new Map<string, { text: string; hash: string; hashMatches: boolean }>();
  if (previous) {
    await Promise.all(
      targets.map(async (target) => {
        const prior = previous.pages[target.docPath];
        if (!prior) return;
        const read = await readSnapshotPage(prior);
        if (read.ok) {
          stored.set(target.docPath, {
            text: read.text,
            hash: sha256(read.text),
            hashMatches: read.hashMatches,
          });
        }
      }),
    );
  }

  const suspect: DocTarget[] = [];
  if (!baseline) {
    for (const page of run.pages) {
      if (!page.text) continue;
      const prev = stored.get(page.target.docPath);
      if (prev && prev.hash !== sha256(page.text)) suspect.push(page.target);
    }
  }
  const confirmations = await confirmChanged(suspect);

  const pages: PageReport[] = [];
  const writes: SnapshotWrite[] = [];
  const manifestPages: Record<string, ManifestPage> = {};

  for (const target of targets) {
    const fetched = byPath.get(target.docPath);
    if (!fetched) continue;

    const prior = previous?.pages[target.docPath];
    const base: Omit<PageReport, "outcome" | "severity" | "hunks"> = {
      docPath: target.docPath,
      url: target.url,
      routes: target.routes,
      title: target.title,
    };

    if (fetched.status === 404) {
      if (prior) manifestPages[target.docPath] = { ...prior, status: "missing" };
      pages.push({
        ...base,
        outcome: "missing",
        severity: "high",
        hunks: [],
        previousSha256: prior?.sha256,
      });
      continue;
    }

    const text = fetched.text!;
    const hash = sha256(text);
    const entry = manifestEntry(target, text, hash, fetched);
    const evidence = { sha256: hash, bytes: entry.bytes, lines: entry.lines };
    const prev = stored.get(target.docPath);

    if (baseline || !prior || !prev) {
      manifestPages[target.docPath] = entry;
      writes.push({ file: target.file, text });
      pages.push({
        ...base,
        ...evidence,
        outcome: "new",
        severity: "none",
        hunks: [],
        error:
          !baseline && prior && !prev
            ? "Stored copy could not be read — re-baselined from upstream."
            : undefined,
      });
      continue;
    }

    if (prev.hash === hash) {
      manifestPages[target.docPath] = entry;
      writes.push({ file: target.file, text });
      pages.push({
        ...base,
        ...evidence,
        previousSha256: prev.hash,
        outcome: "unchanged",
        severity: "none",
        hunks: [],
      });
      continue;
    }

    // Responses are cached for 60s with no ETag, so a deploy landing mid-run
    // can serve a mix of builds. A page whose second read disagrees is held
    // back rather than baselined to a version that may not exist any more.
    const confirm = confirmations.get(target.docPath);
    if (!confirm?.text || sha256(confirm.text) !== hash) {
      manifestPages[target.docPath] = prior;
      pages.push({
        ...base,
        ...evidence,
        previousSha256: prev.hash,
        outcome: "unstable",
        severity: "medium",
        hunks: [],
      });
      continue;
    }

    const diff = diffDocument(prev.text, text);
    manifestPages[target.docPath] = entry;
    writes.push({ file: target.file, text });
    pages.push({
      ...base,
      ...evidence,
      previousSha256: prev.hash,
      outcome: "changed",
      severity: diff.severity,
      hunks: diff.hunks,
      rewritten: diff.rewritten || undefined,
      fenceCountChanged: diff.fenceCountChanged || undefined,
      fenceParseWarning: diff.fenceParseWarning || undefined,
      droppedHunks: diff.droppedHunks || undefined,
      snapshotEdited: prev.hashMatches ? undefined : true,
    });
  }

  const { finding: sitemap, unmapped } = await buildSitemapFinding(
    targets,
    byPath,
    previous,
    baseline,
  );

  const manifest: Manifest = {
    schema: 1,
    docsRoot: DOCS_ROOT,
    syncedAt: ranAt,
    pages: manifestPages,
    sitemap: {
      fetchedAt: sitemap.error ? previous?.sitemap.fetchedAt : ranAt,
      urlsUnderRoot: sitemap.error ? previous?.sitemap.urlsUnderRoot : sitemap.urlsUnderRoot,
      knownUnmapped: [
        ...new Set([...(previous?.sitemap.knownUnmapped ?? []), ...unmapped]),
      ].sort(),
    },
  };

  const committed = await commitSnapshot(writes, manifest);
  if (!committed.ok) {
    return abort(
      ranAt,
      `Could not write the snapshot: ${committed.error}`,
      targets.length,
      run.durationMs,
    );
  }

  const counts = tally(pages);
  const highest = maxSeverity(pages.map((p) => p.severity));
  const changed = counts.changed + counts.missing;

  const report: DocSyncReport = {
    ranAt,
    baseline,
    docsRoot: DOCS_ROOT,
    pages: pages.sort(bySeverityThenPath),
    sitemap,
    counts,
    highest,
    durationMs: run.durationMs,
  };
  await writeReport(report);

  const entry = renderRun(report);
  let changelogError: string | undefined;
  if (entry) {
    const existing = await readChangelog();
    const written = await writeChangelog(mergeChangelog(existing, ranAt.slice(0, 10), entry));
    if (!written.ok) changelogError = written.error;
  }

  const message = baseline
    ? `Baseline created — ${writes.length} pages stored, nothing to compare against yet.`
    : summarize(counts, changed);

  return {
    ok: true,
    baseline,
    message: changelogError ? `${message} (changelog not updated: ${changelogError})` : message,
    changed,
    highest,
  };
}

function manifestEntry(
  target: DocTarget,
  text: string,
  hash: string,
  fetched: FetchedPage,
): ManifestPage {
  return {
    file: target.file,
    sha256: hash,
    bytes: Buffer.byteLength(text, "utf8"),
    lines: text.split("\n").length,
    routes: target.routes,
    status: "ok",
    age: fetched.age,
    date: fetched.date,
  };
}

async function buildSitemapFinding(
  targets: DocTarget[],
  byPath: Map<string, FetchedPage>,
  previous: Manifest | null,
  baseline: boolean,
): Promise<{ finding: SitemapFinding; unmapped: string[] }> {
  const sitemap = await fetchSitemap();
  if (sitemap.error) {
    return {
      finding: { newUnmapped: [], confirmedRemoved: [], urlsUnderRoot: 0, error: sitemap.error },
      unmapped: [],
    };
  }

  const covered = new Set(targets.map((t) => t.url.replace(/\.md$/, "")));
  const known = new Set(previous?.sitemap.knownUnmapped ?? []);
  const upstream = new Set(sitemap.urls);
  const unmapped = sitemap.urls.filter((u) => !covered.has(u) && !known.has(u));

  const confirmedRemoved = targets
    .filter((t) => byPath.get(t.docPath)?.status === 404)
    .map((t) => t.url.replace(/\.md$/, ""))
    .filter((u) => !upstream.has(u));

  return {
    finding: {
      newUnmapped: baseline ? [] : unmapped,
      confirmedRemoved,
      urlsUnderRoot: sitemap.urlsUnderRoot,
    },
    unmapped,
  };
}

function tally(pages: PageReport[]): Record<PageOutcome, number> {
  const counts: Record<PageOutcome, number> = {
    unchanged: 0,
    changed: 0,
    new: 0,
    missing: 0,
    unstable: 0,
    error: 0,
  };
  for (const page of pages) counts[page.outcome]++;
  return counts;
}

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "none"];

function bySeverityThenPath(a: PageReport, b: PageReport): number {
  const rank = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  return rank !== 0 ? rank : a.docPath.localeCompare(b.docPath);
}

function summarize(counts: Record<PageOutcome, number>, changed: number): string {
  if (changed === 0 && counts.unstable === 0) {
    return "No changes — every page matches the snapshot.";
  }
  const parts: string[] = [];
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.missing) parts.push(`${counts.missing} missing`);
  if (counts.new) parts.push(`${counts.new} new`);
  if (counts.unstable) parts.push(`${counts.unstable} unstable`);
  return parts.join(", ");
}

async function abort(
  ranAt: string,
  reason: string,
  pageCount: number,
  durationMs = 0,
): Promise<SyncResult> {
  await writeReport({
    ranAt,
    baseline: false,
    aborted: { reason },
    docsRoot: DOCS_ROOT,
    pages: [],
    sitemap: { newUnmapped: [], confirmedRemoved: [], urlsUnderRoot: 0 },
    counts: { unchanged: 0, changed: 0, new: 0, missing: 0, unstable: 0, error: pageCount },
    highest: "none",
    durationMs,
  });

  return { ok: false, baseline: false, message: reason, changed: 0, highest: "none" };
}
