import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DocSyncReport, Manifest, ManifestPage } from "./types";

/**
 * The snapshot on disk: the previous copy of every doc page, plus the manifest
 * that indexes it.
 *
 * Lives at `<repo>/doc-snapshot/` — deliberately *outside* `frontend/`.
 * `frontend/package-lock.json` is the only lockfile in the tree, so that is
 * where the dev server roots its file watcher. Writing 34 markdown files
 * inside it on every sync would trigger a recompile, which would re-render the
 * page that triggered the sync. Putting the snapshot a level up makes that
 * loop impossible by construction rather than by configuring an ignore list,
 * and keeps it out of `next build`'s output file tracing.
 *
 * Never `import` these JSON files. `resolveJsonModule` is on in tsconfig, so
 * `import manifest from ".../manifest.json"` would compile — and would put the
 * file in the module graph, where writing it invalidates modules mid-request.
 * Always read at request time.
 */

/**
 * `process.cwd()` is `frontend/` under `ng serve`, `ng build` and the built SSR
 * server started from that directory — the same assumption the source
 * generator in `scripts/generate-sources.ts` already makes.
 */
const REPO_ROOT = path.resolve(process.cwd(), "..");

/** Never let an authored path escape the repo. */
function resolveInRepo(repoRelative: string): string {
  const resolved = path.resolve(REPO_ROOT, repoRelative);
  if (!resolved.startsWith(REPO_ROOT + path.sep)) {
    throw new Error(`Refusing to read outside the repo: ${repoRelative}`);
  }
  return resolved;
}

const SNAPSHOT_DIR = "doc-snapshot";
const PAGES_DIR = `${SNAPSHOT_DIR}/pages`;
const REPORTS_DIR = `${SNAPSHOT_DIR}/reports`;
const MANIFEST_FILE = `${SNAPSHOT_DIR}/manifest.json`;
const LATEST_REPORT = `${REPORTS_DIR}/latest.json`;
/** Committed, unlike `reports/` — it is the record that outlives a re-sync. */
const CHANGELOG_FILE = `${SNAPSHOT_DIR}/CHANGELOG.md`;

/** Reports are cheap and gitignored, but unbounded growth is still litter. */
const KEEP_REPORTS = 10;

/** Absolute path to the snapshot root, used by the second-stage write guard. */
const SNAPSHOT_ROOT = path.resolve(REPO_ROOT, SNAPSHOT_DIR);

/**
 * `resolveInRepo` already refuses to escape the repo. This narrows that to the
 * snapshot directory, so a bug in slug generation cannot land a write on
 * `frontend/src`. Three lines, and it is the assertion that would actually
 * save the repo rather than the theoretical one.
 */
function resolveInSnapshot(repoRelative: string): string {
  const resolved = resolveInRepo(repoRelative);
  // The snapshot root itself is allowed so it can be created; everything else
  // must sit strictly inside it.
  if (resolved !== SNAPSHOT_ROOT && !resolved.startsWith(SNAPSHOT_ROOT + path.sep)) {
    throw new Error(`Refusing to write outside the snapshot: ${repoRelative}`);
  }
  return resolved;
}

/**
 * Snapshot filenames are slugs, so they can never legitimately contain a path
 * separator — `docPathToSlug` turns every `/` into `__`. Checking that here
 * means a bug in slug generation fails at the guard with a name, instead of
 * silently resolving into a nested directory and surfacing as a confusing
 * ENOENT from deep inside the write.
 */
function assertPlainFilename(file: string): void {
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    throw new Error(`Refusing to write outside the snapshot: unexpected path in "${file}"`);
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Strip the BOM and normalize line endings before hashing or diffing. */
export function normalizeText(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

export type ManifestState =
  | { kind: "absent" }
  | { kind: "ok"; manifest: Manifest }
  | { kind: "error"; error: string };

export async function readManifest(): Promise<ManifestState> {
  let raw: string;
  try {
    raw = await readFile(resolveInSnapshot(MANIFEST_FILE), "utf8");
  } catch (error) {
    if (isNotFound(error)) return { kind: "absent" };
    return { kind: "error", error: describe(error) };
  }

  try {
    const manifest = JSON.parse(raw) as Manifest;
    if (manifest.schema !== 1 || typeof manifest.pages !== "object") {
      return { kind: "error", error: "manifest.json is not a schema 1 manifest" };
    }
    // Older manifests may predate the sitemap block; normalize rather than
    // making every reader null-check it.
    manifest.sitemap ??= { knownUnmapped: [] };
    manifest.sitemap.knownUnmapped ??= [];
    return { kind: "ok", manifest };
  } catch (error) {
    return { kind: "error", error: `manifest.json is not valid JSON: ${describe(error)}` };
  }
}

/**
 * The stored body of one page, plus whether it still hashes to what the
 * manifest recorded for it.
 *
 * The body is returned either way. A mismatch means the file was edited or
 * truncated behind the manifest's back, which the caller reports rather than
 * treats as fatal — the bytes on disk are what the snapshot actually holds, so
 * they remain the honest thing to compare upstream against.
 */
export async function readSnapshotPage(
  entry: ManifestPage,
): Promise<
  { ok: true; text: string; hashMatches: boolean } | { ok: false; error: string }
> {
  try {
    const raw = await readFile(resolveInSnapshot(`${PAGES_DIR}/${entry.file}`), "utf8");
    const text = normalizeText(raw);
    return { ok: true, text, hashMatches: sha256(text) === entry.sha256 };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export interface SnapshotWrite {
  file: string;
  text: string;
}

/**
 * Commit protocol: bodies first, manifest last.
 *
 * The manifest is the commit point because the diff basis is
 * `manifest.pages[].sha256`, not the bodies. If the process dies between the
 * two steps the next run still diffs from the last valid manifest, so a torn
 * write degrades to "that run didn't happen" rather than to a corrupt
 * baseline. The manifest itself goes through a temp file and a rename so it is
 * never observed half-written.
 */
export async function commitSnapshot(
  pages: SnapshotWrite[],
  manifest: Manifest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await mkdir(resolveInSnapshot(PAGES_DIR), { recursive: true });

    for (const page of pages) {
      assertPlainFilename(page.file);
      await writeFile(resolveInSnapshot(`${PAGES_DIR}/${page.file}`), page.text, "utf8");
    }

    await writeAtomic(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

/**
 * Reports are written per run *and* to `latest.json`.
 *
 * Without the timestamped copy, the second click of an auto-syncing button
 * destroys the first run's findings: the sync succeeds, the snapshot now
 * matches upstream, and the report you were reading is replaced by "no
 * changes". They are gitignored, so keeping ten costs nothing.
 */
export async function writeReport(
  report: DocSyncReport,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await mkdir(resolveInSnapshot(REPORTS_DIR), { recursive: true });
    const body = `${JSON.stringify(report, null, 2)}\n`;
    const stamped = `${REPORTS_DIR}/${report.ranAt.replace(/[:.]/g, "-")}.json`;

    await writeAtomic(stamped, body);
    await writeAtomic(LATEST_REPORT, body);
    await pruneReports();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

/** Empty string when the changelog does not exist yet — the first change creates it. */
export async function readChangelog(): Promise<string> {
  try {
    return await readFile(resolveInSnapshot(CHANGELOG_FILE), "utf8");
  } catch {
    return "";
  }
}

export async function writeChangelog(
  markdown: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await mkdir(resolveInSnapshot(SNAPSHOT_DIR), { recursive: true });
    await writeAtomic(CHANGELOG_FILE, markdown);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export async function readLatestReport(): Promise<DocSyncReport | null> {
  try {
    const raw = await readFile(resolveInSnapshot(LATEST_REPORT), "utf8");
    return JSON.parse(raw) as DocSyncReport;
  } catch {
    // A missing or unparseable report is the normal state on a fresh clone —
    // reports are derived data and gitignored. Never surface it as an error.
    return null;
  }
}

/** Prior runs, newest first, for the history list on `/doc-sync`. */
export async function listReports(): Promise<string[]> {
  try {
    const names = await readdir(resolveInSnapshot(REPORTS_DIR));
    return names
      .filter((n) => n.endsWith(".json") && n !== "latest.json")
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function pruneReports(): Promise<void> {
  const stamped = await listReports();
  for (const name of stamped.slice(KEEP_REPORTS)) {
    await unlink(resolveInSnapshot(`${REPORTS_DIR}/${name}`)).catch(() => {});
  }
}

async function writeAtomic(repoRelative: string, body: string): Promise<void> {
  const target = resolveInSnapshot(repoRelative);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, target);
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
