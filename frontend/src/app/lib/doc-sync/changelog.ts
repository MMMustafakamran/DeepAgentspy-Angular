import type { DocSyncReport, PageOutcome, PageReport } from "./types";

/**
 * The human-readable record of what the docs changed, and where.
 *
 * This exists because the sync overwrites its own comparison basis: replacing
 * the snapshot is what makes the *next* run report "no changes", so a finding
 * that is only shown in the live report vanishes the moment you sync again.
 * The changelog is written at the moment of discovery and is never rewritten
 * by a later run, so a change survives being synced past.
 *
 * Pure — no fs. `store.ts` owns reading and writing the file.
 */

/**
 * How many dated entries to keep. Counted as entries, not as a date window:
 * three headings are retained however far apart they fall, so a change from
 * six weeks ago still shows if nothing has happened since. A date-based window
 * would silently drop it for being old, which is the opposite of useful.
 */
export const KEEP_ENTRIES = 3;

/** Outcomes worth recording. Anything unchanged is deliberately never written. */
const LOGGED: ReadonlySet<PageOutcome> = new Set<PageOutcome>([
  "changed",
  "missing",
  "unstable",
  "new",
]);

const TITLE = "# Doc drift changelog";

const INTRO = [
  "What the CopilotKit docs changed under this repo, written by the sync on",
  "`/doc-sync`. Only pages that actually moved are recorded — a sync that finds",
  "everything unchanged writes nothing here at all.",
  "",
  `Holds the ${KEEP_ENTRIES} most recent dated entries. When a change lands on a fourth`,
  "date, the oldest entry is dropped. Entries are counted, not aged, so a gap of",
  "weeks between changes does not expire anything.",
].join("\n");

export interface ChangelogSection {
  date: string;
  body: string;
}

/** Splits an existing changelog into its dated `## YYYY-MM-DD` sections. */
export function splitSections(markdown: string): ChangelogSection[] {
  const heading = /^## (\d{4}-\d{2}-\d{2})[^\n]*$/gm;
  const found: { date: string; start: number; end: number }[] = [];

  for (let m = heading.exec(markdown); m !== null; m = heading.exec(markdown)) {
    found.push({ date: m[1], start: m.index, end: m.index });
  }

  return found.map((entry, i) => {
    const stop = i + 1 < found.length ? found[i + 1].start : markdown.length;
    const block = markdown.slice(entry.start, stop);
    // Drop the heading line itself; it is regenerated on write.
    return { date: entry.date, body: block.replace(/^## [^\n]*\n?/, "").trim() };
  });
}

function severityWord(page: PageReport): string {
  return page.severity === "none" ? "Info" : page.severity[0].toUpperCase() + page.severity.slice(1);
}

/** A sentence saying what actually moved, derived from the annotated hunks. */
function describe(page: PageReport): string {
  if (page.outcome === "missing") return "Returned 404 — the stored copy was kept.";
  if (page.outcome === "unstable") {
    return "Two reads seconds apart disagreed; held back from the snapshot.";
  }
  if (page.outcome === "new") return "Now tracked for the first time.";
  if (page.rewritten) return "Rewritten past the diff cap.";

  const changed = page.hunks.flatMap((h) => h.lines).filter((l) => l.op !== "context");
  const code = changed.filter((l) => l.kind === "code" || l.kind.startsWith("fence")).length;
  const headings = changed.filter((l) => l.kind === "heading").length;
  const prose = changed.filter((l) => l.kind === "prose" || l.kind === "frontmatter").length;

  const parts: string[] = [];
  if (code) parts.push(`${code} code line${code === 1 ? "" : "s"}`);
  if (headings) parts.push(`${headings} heading${headings === 1 ? "" : "s"}`);
  if (prose) parts.push(`${prose} prose line${prose === 1 ? "" : "s"}`);

  const summary = parts.length > 0 ? `${parts.join(", ")} changed.` : "Content changed.";
  return page.fenceCountChanged
    ? `${summary} The number of fenced code blocks changed.`
    : summary;
}

/** Where in the page it happened — section heading and enclosing code language. */
function locate(page: PageReport): string {
  const hunk = page.hunks[0];
  const bits: string[] = [`\`${page.docPath}\``];
  if (page.routes.length > 0) bits.push(`route${page.routes.length === 1 ? "" : "s"} ${page.routes.map((r) => `\`${r}\``).join(", ")}`);
  if (hunk?.heading) bits.push(`under “${hunk.heading}”`);
  if (hunk?.language) bits.push(`in a \`${hunk.language}\` block`);
  return bits.join(" · ");
}

/** Up to `max` changed lines, as a diff block. */
function excerpt(page: PageReport, max = 8): string | null {
  const lines = page.hunks
    .flatMap((h) => h.lines)
    .filter((l) => l.op !== "context")
    .slice(0, max)
    .map((l) => `${l.op === "add" ? "+" : "-"} ${l.text.trim()}`);

  if (lines.length === 0) return null;
  // Four backticks: doc pages are full of three-backtick fences, and an excerpt
  // that closes its own container silently corrupts the rest of the file.
  return ["````diff", ...lines, "````"].join("\n");
}

/**
 * One run's worth of markdown, or null when there is nothing worth recording.
 *
 * Returns null for baseline and aborted runs too: a baseline stores every page
 * for the first time, which is not a doc change, and an aborted run wrote no
 * snapshot so nothing moved.
 */
export function renderRun(report: DocSyncReport): string | null {
  if (report.baseline || report.aborted) return null;

  const notable = report.pages.filter((p) => LOGGED.has(p.outcome));
  if (notable.length === 0) return null;

  const time = report.ranAt.slice(11, 16);
  const lines: string[] = [
    `### ${time} UTC — ${notable.length} page${notable.length === 1 ? "" : "s"}, highest severity ${report.highest}`,
    "",
  ];

  for (const page of notable) {
    // Locally-edited snapshots are recorded too, so a hand edit is a working
    // way to exercise this file — but they are labelled, because otherwise the
    // record would assert that CopilotKit changed something it did not.
    const heading = page.snapshotEdited
      ? `**${severityWord(page)} — ${page.title}** · _local snapshot edit, not an upstream change_`
      : `**${severityWord(page)} — ${page.title}**`;

    lines.push(heading, "", locate(page), "", describe(page), "");
    const diff = excerpt(page);
    if (diff) lines.push(diff, "");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Folds a run into the existing changelog, newest first, pruned to
 * `KEEP_ENTRIES` dated entries.
 *
 * Several runs on one date share that date's entry rather than each claiming a
 * slot, so a day spent pressing the button repeatedly cannot evict the two
 * previous dates.
 */
export function mergeChangelog(existing: string, date: string, run: string): string {
  const sections = splitSections(existing);
  const sameDay = sections.find((s) => s.date === date);

  if (sameDay) {
    sameDay.body = `${run}\n\n${sameDay.body}`.trim();
  } else {
    sections.push({ date, body: run });
  }

  const kept = sections
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, KEEP_ENTRIES);

  const rendered = kept.map((s) => `## ${s.date}\n\n${s.body}`).join("\n\n---\n\n");
  return `${TITLE}\n\n${INTRO}\n\n${rendered}\n`;
}
