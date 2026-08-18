/**
 * The wire format between the sync action, the snapshot on disk, and the UI.
 *
 * Kept free of `server-only` and of any Node import on purpose: the client
 * button imports `SyncResult` as a type, so this module has to be safe to pull
 * into a client bundle. Everything that touches the filesystem lives in
 * `store.ts`; everything that touches the network lives in `fetch-docs.ts`.
 */

/**
 * How much a change threatens the implementation on the corresponding route.
 *
 * Deliberately *not* folded into `RouteStatus` from `nav-config.ts` — that
 * union is the nav's vocabulary for "did we build this yet", which is a
 * different question from "did the doc move under us".
 */
export type Severity = "high" | "medium" | "low" | "none";

export const SEVERITY_RANK: Record<Severity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function maxSeverity(values: Severity[]): Severity {
  return values.reduce<Severity>(
    (worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst),
    "none",
  );
}

/** What the classifier decided a single source line *is*. */
export type LineKind =
  | "frontmatter"
  | "heading"
  | "fence-open"
  | "code"
  | "fence-close"
  | "prose";

export type PageOutcome =
  /** Hash matched the manifest. */
  | "unchanged"
  /** Hash differed and the confirmation re-read agreed. */
  | "changed"
  /** In the nav but not in the previous manifest — nothing to compare against. */
  | "new"
  /** 404 upstream. */
  | "missing"
  /** Two reads in the same run disagreed — a deploy probably landed mid-run. */
  | "unstable"
  /** Fetch failed for a reason that is not a 404. */
  | "error";

export type DiffLineOp = "context" | "add" | "remove";

export interface DiffLine {
  op: DiffLineOp;
  text: string;
  /** Zone of this line, from the old doc for removals and the new for adds. */
  kind: LineKind;
}

export interface Hunk {
  /** 1-based line number in the new document (old, for pure deletions). */
  startLine: number;
  lines: DiffLine[];
  severity: Severity;
  /** Nearest preceding heading, so a hunk can say where it lives. */
  heading?: string;
  /** Info string of the enclosing fence, when the hunk is inside one. */
  language?: string;
  /** Set when the hunk hit the per-hunk line cap. */
  truncated?: boolean;
}

export interface PageReport {
  docPath: string;
  url: string;
  /** Every nav route that points at this doc page. */
  routes: string[];
  title: string;
  outcome: PageOutcome;
  severity: Severity;
  hunks: Hunk[];
  /**
   * What the comparison actually looked at. Carried even for unchanged pages
   * so the report can show its own evidence — "this hash matched" is the whole
   * proof that a page was checked rather than skipped.
   */
  sha256?: string;
  previousSha256?: string;
  bytes?: number;
  lines?: number;
  /** Set when the page changed so much the LCS cap was hit. */
  rewritten?: boolean;
  /** Fence counts disagreed between old and new — an independent HIGH signal. */
  fenceCountChanged?: boolean;
  /** The annotator hit EOF with a fence still open. Classification is shaky. */
  fenceParseWarning?: boolean;
  /**
   * The stored copy did not hash to what the manifest recorded, so this
   * difference originated locally — a hand edit or a corrupted file — rather
   * than upstream.
   */
  snapshotEdited?: boolean;
  /** Hunks dropped because the per-page cap was hit. */
  droppedHunks?: number;
  error?: string;
}

export interface SitemapFinding {
  /** Upstream URLs under this framework's prefix that no nav route covers. */
  newUnmapped: string[];
  /** Nav pages that 404 *and* are absent from the sitemap — confirmed removed. */
  confirmedRemoved: string[];
  urlsUnderRoot: number;
  error?: string;
}

export interface DocSyncReport {
  /** ISO timestamp; also the report's filename. */
  ranAt: string;
  /** True when there was no prior manifest, so nothing could be compared. */
  baseline: boolean;
  /** Set when the run refused to commit. The old snapshot is intact. */
  aborted?: { reason: string };
  docsRoot: string;
  pages: PageReport[];
  sitemap: SitemapFinding;
  counts: Record<PageOutcome, number>;
  highest: Severity;
  /** Wall-clock milliseconds for the fetch phase. */
  durationMs: number;
}

export interface ManifestPage {
  /** Filename under `doc-snapshot/pages/`. */
  file: string;
  sha256: string;
  bytes: number;
  lines: number;
  routes: string[];
  status: "ok" | "missing" | "error";
  /**
   * The CDN `age` and `date` headers at fetch time. Kept purely as forensics:
   * a run whose `age` values are wildly scattered was probably served across a
   * deploy boundary, which is otherwise undiagnosable after the fact.
   */
  age?: number;
  date?: string;
}

export interface Manifest {
  schema: 1;
  docsRoot: string;
  /** The repo's single doc-sync date — rewritten every time the sync button runs. */
  syncedAt: string;
  pages: Record<string, ManifestPage>;
  sitemap: {
    fetchedAt?: string;
    urlsUnderRoot?: number;
    /**
     * Upstream URLs we have seen and consciously chose not to build a route
     * for. Committed and hand-pruned, so the report only ever shouts about
     * pages that appeared *since the last sync* rather than re-listing the
     * ~140 pages this harness will never cover.
     */
    knownUnmapped: string[];
  };
}

/** What `runDocSync()` hands back to the button. Must stay serializable. */
export interface SyncResult {
  ok: boolean;
  baseline: boolean;
  message: string;
  changed: number;
  highest: Severity;
}
