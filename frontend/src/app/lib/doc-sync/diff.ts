import {
  maxSeverity,
  type DiffLine,
  type Hunk,
  type LineKind,
  type Severity,
} from "./types";

/**
 * Comparing two versions of a doc page, and deciding how much the difference
 * matters.
 *
 * The load-bearing idea: *detection* is done by SHA-256 in the caller, not
 * here. A page is changed if and only if its hash moved. Everything in this
 * file is presentation and triage — so a bug here can render an ugly hunk or
 * mis-rank a severity, but can never report "unchanged" for a page that
 * changed. That is what makes hand-rolling this preferable to a dependency
 * that fourteen sibling repos would each have to install.
 *
 * Note for anyone tempted to simplify: `diff@5.2.2` *is* resolvable from
 * `node_modules` today, hoisted transitively via `@copilotkit/react-core`. It
 * is not a declared dependency, so importing it typechecks and runs right up
 * until a clean install or a hoisting change breaks it silently.
 */

/** Beyond this the DP table stops being worth its memory; the page is a rewrite. */
const LCS_CAP = 1200;
const CONTEXT = 3;
const MAX_HUNKS = 40;
const MAX_HUNK_LINES = 60;

export interface Annotation {
  kinds: LineKind[];
  /** Nearest preceding heading, so a hunk can say which section it is in. */
  headings: (string | undefined)[];
  /** Info string of the enclosing fence, for lines inside one. */
  languages: (string | undefined)[];
  /** Reached EOF with a fence still open — classification below is unreliable. */
  fenceParseWarning: boolean;
  /** Fenced-block count keyed by language, for the independent cross-check. */
  fenceCounts: Record<string, number>;
}

/**
 * Walks a document once and labels every line.
 *
 * This has to happen *before* diffing, not be inferred from the diff. A hunk
 * can begin in the middle of a code block, and `+`/`-` lines carry no record
 * of whether the surrounding document had a fence open — so fence state read
 * off a diff is wrong exactly when it matters most.
 */
export function annotate(lines: string[]): Annotation {
  const kinds = new Array<LineKind>(lines.length);
  const headings = new Array<string | undefined>(lines.length);
  const languages = new Array<string | undefined>(lines.length);
  const fenceCounts: Record<string, number> = {};

  let inFrontmatter = lines.length > 0 && lines[0].trim() === "---";
  let open = false;
  let openChar = "";
  let openLen = 0;
  let openInfo: string | undefined;
  let heading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    headings[i] = heading;

    if (inFrontmatter) {
      kinds[i] = "frontmatter";
      if (i > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }

    if (open) {
      // The closing fence must use the same character and be *at least as
      // long* as the opener. That length rule is what makes nested fences
      // work — docs wrap ``` blocks inside ```` blocks to show markdown
      // samples, and a scanner that closes on the first ``` mis-labels the
      // rest of the page.
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === openChar && close[1].length >= openLen) {
        kinds[i] = "fence-close";
        languages[i] = openInfo;
        open = false;
        openInfo = undefined;
        continue;
      }
      kinds[i] = "code";
      languages[i] = openInfo;
      continue;
    }

    // Any indentation opens a fence, not CommonMark's three spaces.
    //
    // In pure Markdown a four-space indent means an indented code block and
    // the ``` is literal, so `^ {0,3}` is right. These pages are MDX: fences
    // sit inside `<Tabs>`, `<Tab>` and `<Steps>`, which indent them by four,
    // eight, twelve, even twenty-four spaces, and they are still fences.
    // Applying the CommonMark rule here missed 41% of the fence markers
    // across the tracked corpus — on one page, all 33 of them — which
    // silently demoted every code change on those pages from High to Low.
    // That is the one classification this feature exists to get right.
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const char = fence[1][0];
      const info = fence[2].trim();
      // CommonMark: a backtick fence's info string may not contain a backtick,
      // which is how ``` opening a block is told apart from inline `code`.
      if (char === "~" || !info.includes("`")) {
        open = true;
        openChar = char;
        openLen = fence[1].length;
        openInfo = info.split(/\s+/)[0] || undefined;
        const key = openInfo ?? "(plain)";
        fenceCounts[key] = (fenceCounts[key] ?? 0) + 1;
        kinds[i] = "fence-open";
        languages[i] = openInfo;
        continue;
      }
    }

    // Indented for the same reason fences are — headings nested in `<Tab>` or
    // `<Step>` carry the surrounding JSX indentation. Safe to relax because a
    // `#` inside a code block never reaches here: the fence branch above owns
    // every line between an opener and its closer.
    const head = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      heading = head[2].trim().replace(/\s+#+\s*$/, "");
      headings[i] = heading;
      kinds[i] = "heading";
      continue;
    }

    kinds[i] = "prose";
  }

  return { kinds, headings, languages, fenceParseWarning: open, fenceCounts };
}

interface Op {
  op: "context" | "add" | "remove";
  oldIndex?: number;
  newIndex?: number;
}

/** Trailing whitespace is never meaningful; leading whitespace inside a fence is. */
function key(line: string): string {
  return line.trimEnd();
}

export function diffLines(
  oldLines: string[],
  newLines: string[],
): { ops: Op[]; rewritten: boolean } {
  let start = 0;
  const shortest = Math.min(oldLines.length, newLines.length);
  while (start < shortest && key(oldLines[start]) === key(newLines[start])) start++;

  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (
    endOld > start &&
    endNew > start &&
    key(oldLines[endOld - 1]) === key(newLines[endNew - 1])
  ) {
    endOld--;
    endNew--;
  }

  const spanOld = endOld - start;
  const spanNew = endNew - start;
  if (spanOld > LCS_CAP || spanNew > LCS_CAP) {
    return { ops: [], rewritten: true };
  }

  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ op: "context", oldIndex: i, newIndex: i });

  // dp[i][j] = length of the LCS of oldLines[start+i..] and newLines[start+j..]
  const width = spanNew + 1;
  const dp = new Int32Array((spanOld + 1) * width);
  for (let i = spanOld - 1; i >= 0; i--) {
    for (let j = spanNew - 1; j >= 0; j--) {
      dp[i * width + j] =
        key(oldLines[start + i]) === key(newLines[start + j])
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < spanOld && j < spanNew) {
    if (key(oldLines[start + i]) === key(newLines[start + j])) {
      ops.push({ op: "context", oldIndex: start + i, newIndex: start + j });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      ops.push({ op: "remove", oldIndex: start + i });
      i++;
    } else {
      ops.push({ op: "add", newIndex: start + j });
      j++;
    }
  }
  while (i < spanOld) ops.push({ op: "remove", oldIndex: start + i++ });
  while (j < spanNew) ops.push({ op: "add", newIndex: start + j++ });

  for (let k = 0; k < oldLines.length - endOld; k++) {
    ops.push({ op: "context", oldIndex: endOld + k, newIndex: endNew + k });
  }

  return { ops, rewritten: false };
}

function kindOf(op: Op, oldAnn: Annotation, newAnn: Annotation): LineKind {
  if (op.op === "remove") return oldAnn.kinds[op.oldIndex!] ?? "prose";
  if (op.op === "add") return newAnn.kinds[op.newIndex!] ?? "prose";
  return newAnn.kinds[op.newIndex!] ?? oldAnn.kinds[op.oldIndex!] ?? "prose";
}

function textOf(op: Op, oldLines: string[], newLines: string[]): string {
  return op.op === "remove" ? oldLines[op.oldIndex!] : newLines[op.newIndex!];
}

function severityForKind(kind: LineKind, text: string): Severity {
  switch (kind) {
    case "code":
    case "fence-open":
    case "fence-close":
      return "high";
    case "heading":
      return "medium";
    case "frontmatter":
      // `title` and `description` feed RouteMeta.title / RouteMeta.summary, so
      // a change there means the nav is now describing the page wrongly.
      return /^\s*(title|description)\s*:/i.test(text) ? "medium" : "low";
    default:
      return "low";
  }
}

export interface PageDiff {
  hunks: Hunk[];
  severity: Severity;
  rewritten: boolean;
  fenceCountChanged: boolean;
  fenceParseWarning: boolean;
  droppedHunks: number;
}

export function diffDocument(oldText: string, newText: string): PageDiff {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const oldAnn = annotate(oldLines);
  const newAnn = annotate(newLines);

  // An independent signal that does not depend on the LCS being correct: if
  // the number of fenced blocks (or their languages) moved, code changed,
  // whatever the line diff decided.
  const fenceCountChanged =
    JSON.stringify(oldAnn.fenceCounts) !== JSON.stringify(newAnn.fenceCounts);
  const fenceParseWarning = oldAnn.fenceParseWarning || newAnn.fenceParseWarning;

  const { ops, rewritten } = diffLines(oldLines, newLines);
  if (rewritten) {
    return {
      hunks: [],
      severity: "high",
      rewritten: true,
      fenceCountChanged,
      fenceParseWarning,
      droppedHunks: 0,
    };
  }

  const changedAt = ops
    .map((op, index) => (op.op === "context" ? -1 : index))
    .filter((index) => index >= 0);

  if (changedAt.length === 0) {
    return {
      hunks: [],
      severity: fenceCountChanged ? "high" : "none",
      rewritten: false,
      fenceCountChanged,
      fenceParseWarning,
      droppedHunks: 0,
    };
  }

  // Group changes that are within two context windows of each other, so
  // neighbouring edits render as one readable hunk rather than three.
  const groups: Array<[number, number]> = [];
  let groupStart = changedAt[0];
  let groupEnd = changedAt[0];
  for (const index of changedAt.slice(1)) {
    if (index - groupEnd <= CONTEXT * 2) {
      groupEnd = index;
    } else {
      groups.push([groupStart, groupEnd]);
      groupStart = index;
      groupEnd = index;
    }
  }
  groups.push([groupStart, groupEnd]);

  const built: Hunk[] = [];
  for (const [from, to] of groups) {
    const lo = Math.max(0, from - CONTEXT);
    const hi = Math.min(ops.length - 1, to + CONTEXT);
    const slice = ops.slice(lo, hi + 1);

    const changed = slice.filter((op) => op.op !== "context");
    if (isWhitespaceOnly(changed, oldLines, newLines)) continue;

    const truncated = slice.length > MAX_HUNK_LINES;
    const shown = truncated ? slice.slice(0, MAX_HUNK_LINES) : slice;

    const lines: DiffLine[] = shown.map((op) => ({
      op: op.op,
      text: textOf(op, oldLines, newLines) ?? "",
      kind: kindOf(op, oldAnn, newAnn),
    }));

    const severity = maxSeverity(
      changed.map((op) =>
        severityForKind(kindOf(op, oldAnn, newAnn), textOf(op, oldLines, newLines) ?? ""),
      ),
    );

    const anchor = slice[0];
    const startLine = (anchor.newIndex ?? anchor.oldIndex ?? 0) + 1;
    const firstChanged = changed[0];
    const ann = firstChanged.op === "remove" ? oldAnn : newAnn;
    const annIndex = firstChanged.oldIndex ?? firstChanged.newIndex ?? 0;

    built.push({
      startLine,
      lines,
      severity,
      heading: ann.headings[annIndex],
      language: ann.languages[annIndex],
      truncated: truncated || undefined,
    });
  }

  // Prose sitting in the same section as a changed code block is not
  // cosmetic — redefining what a snippet means in the surrounding sentence is
  // a real way for an implementation to go stale while the code looks
  // untouched. Bump those out of LOW.
  const highSections = new Set(
    built.filter((h) => h.severity === "high").map((h) => h.heading ?? ""),
  );
  for (const hunk of built) {
    if (hunk.severity === "low" && highSections.has(hunk.heading ?? "")) {
      hunk.severity = "medium";
    }
  }

  const kept = built.slice(0, MAX_HUNKS);
  return {
    hunks: kept,
    severity: maxSeverity([
      ...built.map((h) => h.severity),
      fenceCountChanged ? "high" : "none",
    ]),
    rewritten: false,
    fenceCountChanged,
    fenceParseWarning,
    droppedHunks: built.length - kept.length,
  };
}

/**
 * A change that only moves whitespace around is noise. Filtering it here keeps
 * a reformatting pass upstream from burying the one real edit in the report.
 */
function isWhitespaceOnly(changed: Op[], oldLines: string[], newLines: string[]): boolean {
  const removed = changed
    .filter((op) => op.op === "remove")
    .map((op) => oldLines[op.oldIndex!].trim())
    .filter((line) => line.length > 0)
    .sort();
  const added = changed
    .filter((op) => op.op === "add")
    .map((op) => newLines[op.newIndex!].trim())
    .filter((line) => line.length > 0)
    .sort();

  return removed.length === added.length && removed.every((line, i) => line === added[i]);
}

/**
 * Fixtures for the annotator, rendered as a pass/fail panel on `/doc-sync`.
 *
 * There is no test runner in this repo and adding one across fourteen of them
 * is not worth it — but the fence scanner is the one piece with real edge
 * cases, and a harness repo shipping its own check as a route is in keeping
 * with what this project is. Each fixture asserts the kind of one line.
 */
export const FENCE_FIXTURES: Array<{
  name: string;
  source: string;
  line: number;
  expect: LineKind;
}> = [
  {
    name: "nested fence keeps outer block open",
    source: "````md\n```py\nx = 1\n```\n````",
    line: 2,
    expect: "code",
  },
  {
    name: "tilde fence",
    source: "~~~python\nx = 1\n~~~",
    line: 1,
    expect: "code",
  },
  {
    name: "unterminated fence does not swallow silently",
    source: "```py\nx = 1",
    line: 1,
    expect: "code",
  },
  {
    name: "indented fence still opens",
    source: "   ```py\n   x = 1\n   ```",
    line: 1,
    expect: "code",
  },
  {
    // The regression that mattered: MDX indents fences inside <Tabs>/<Tab>,
    // and CommonMark's three-space limit missed every one of them.
    name: "deeply indented fence inside <Tab> still opens",
    source:
      '<Tabs>\n    <Tab value="Python">\n        ```python title="agent.py"\n        steps = ["one"]\n        ```\n    </Tab>\n</Tabs>',
    line: 3,
    expect: "code",
  },
  {
    name: "heading indented inside JSX is still a heading",
    source: "<Step>\n    ## Install the package\n    prose here\n</Step>",
    line: 1,
    expect: "heading",
  },
  {
    name: "backtick in info string does not open a fence",
    source: "``` `inline` ```\nplain prose",
    line: 1,
    expect: "prose",
  },
  {
    name: "front matter is not prose",
    source: "---\ntitle: Quickstart\n---\n# Heading",
    line: 1,
    expect: "frontmatter",
  },
];

export function runFenceSelfCheck(): Array<{ name: string; ok: boolean; got: LineKind }> {
  return FENCE_FIXTURES.map((fixture) => {
    const got = annotate(fixture.source.split("\n")).kinds[fixture.line];
    return { name: fixture.name, ok: got === fixture.expect, got };
  });
}
