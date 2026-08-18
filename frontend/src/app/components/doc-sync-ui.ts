/** Presentational pieces for the doc-drift report. */
import { Component, computed, input } from '@angular/core';

import type { Hunk, PageOutcome, PageReport, Severity } from '../lib/doc-sync/types';

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'border-rose-300 bg-rose-50 text-rose-800',
  medium: 'border-amber-300 bg-amber-50 text-amber-800',
  low: 'border-violet-300 bg-violet-50 text-violet-800',
  none: 'border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--muted)]',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

@Component({
  selector: 'doc-severity-badge',
  template: `
    <span
      class="inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
      [class]="classes()"
      >{{ label() }}</span
    >
  `,
})
export class SeverityBadge {
  readonly severity = input.required<Severity>();
  protected readonly classes = computed(() => SEVERITY_STYLES[this.severity()]);
  protected readonly label = computed(() => SEVERITY_LABEL[this.severity()]);
}

const OUTCOME_LABEL: Record<PageOutcome, string> = {
  unchanged: 'Unchanged',
  changed: 'Changed',
  new: 'New',
  missing: '404 upstream',
  unstable: 'Unstable',
  error: 'Error',
};

const OUTCOME_MARK: Record<PageOutcome, { glyph: string; className: string }> = {
  unchanged: { glyph: '✓', className: 'text-emerald-600' },
  changed: { glyph: '!', className: 'text-amber-600' },
  new: { glyph: '+', className: 'text-sky-600' },
  missing: { glyph: '✗', className: 'text-rose-600' },
  unstable: { glyph: '~', className: 'text-amber-600' },
  error: { glyph: '✗', className: 'text-rose-600' },
};

/**
 * The per-section check mark. An absent outcome means the page was not part of
 * the last run, and renders as a neutral dot rather than a tick — "not checked"
 * and "checked and fine" must never look alike.
 */
@Component({
  selector: 'doc-check-mark',
  template: `
    <span
      class="inline-flex w-4 shrink-0 justify-center font-mono text-sm font-semibold"
      [class]="mark().className"
      [attr.aria-label]="label()"
      [title]="label()"
      >{{ mark().glyph }}</span
    >
  `,
})
export class CheckMark {
  readonly outcome = input<PageOutcome | undefined>();
  protected readonly mark = computed(
    () =>
      (this.outcome() ? OUTCOME_MARK[this.outcome()!] : undefined) ?? {
        glyph: '·',
        className: 'text-[var(--muted)]',
      },
  );
  protected readonly label = computed(() =>
    this.outcome() ? OUTCOME_LABEL[this.outcome()!] : 'Not checked',
  );
}

export const OUTCOME_TEXT: Record<PageOutcome, string> = {
  unchanged: 'unchanged',
  changed: 'changed',
  new: 'stored',
  missing: '404 upstream',
  unstable: 'unstable',
  error: 'error',
};

/**
 * One diff hunk. Deliberately not syntax-highlighted, unlike every other code
 * surface here: the `+`/`−` gutters and interleaved old/new lines are not valid
 * input to any grammar, so highlighting them produces confidently wrong colours.
 */
@Component({
  selector: 'doc-hunk',
  imports: [SeverityBadge],
  template: `
    <div class="rounded-lg border border-[var(--line)]">
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] px-3 py-2 text-xs"
      >
        <doc-severity-badge [severity]="hunk().severity" />
        <span class="font-mono text-[var(--muted)]">line {{ hunk().startLine }}</span>
        @if (hunk().heading) {
          <span class="text-[var(--ink-soft)]"
            >under <span class="font-medium">{{ hunk().heading }}</span></span
          >
        }
        @if (hunk().language) {
          <code
            class="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[var(--ink-soft)]"
            >{{ hunk().language }}</code
          >
        }
        @if (hunk().truncated) {
          <span class="text-amber-700">truncated</span>
        }
      </div>
      <div class="overflow-x-auto">
        <pre class="min-w-full text-xs leading-relaxed">@for (line of hunk().lines; track $index) {<span
            class="flex gap-2 px-3"
            [class]="lineClass(line.op)"
          ><span aria-hidden="true" class="select-none opacity-60">{{ gutter(line.op) }}</span><span
              class="break-words whitespace-pre-wrap"
              >{{ line.text || ' ' }}</span
            ></span>}</pre>
      </div>
    </div>
  `,
})
export class HunkView {
  readonly hunk = input.required<Hunk>();

  protected lineClass(op: string): string {
    if (op === 'add') return 'bg-emerald-50 text-emerald-900';
    if (op === 'remove') return 'bg-rose-50 text-rose-900';
    return 'text-[var(--muted)]';
  }

  protected gutter(op: string): string {
    return op === 'add' ? '+' : op === 'remove' ? '−' : ' ';
  }
}

/**
 * What expanding a section row shows: the comparison between the stored copy
 * and the one just fetched. An unchanged page has no diff by definition, so it
 * shows the two matching hashes instead — that is the evidence the check ran,
 * which is the point of listing every page rather than only the broken ones.
 */
@Component({
  selector: 'doc-comparison',
  imports: [HunkView],
  template: `
    @if (!page()) {
      <p class="text-sm text-[var(--ink-soft)]">
        This doc page was not part of the last run.
      </p>
    } @else {
      <div class="space-y-3">
        @if (page()!.error) {
          <p class="text-sm text-amber-700">{{ page()!.error }}</p>
        }
        @if (page()!.outcome === 'unchanged') {
          <p class="text-sm text-[var(--ink-soft)]">
            Identical — the page fetched just now hashes the same as the stored
            copy, so nothing on this route needs re-checking.
          </p>
        }
        @if (page()!.outcome === 'new') {
          <p class="text-sm text-[var(--ink-soft)]">
            Stored for the first time. There was no earlier copy to compare
            against, so differences start showing from the next sync.
          </p>
        }
        @if (page()!.outcome === 'missing') {
          <p class="text-sm text-rose-700">
            The page returned 404. The previously stored copy has been kept, so
            you can still read what it used to say.
          </p>
        }
        @if (page()!.outcome === 'unstable') {
          <p class="text-sm text-amber-700">
            Two reads seconds apart returned different content — a deploy
            probably landed mid-run. This page was left out of the snapshot;
            sync again.
          </p>
        }
        @if (page()!.snapshotEdited) {
          <p class="text-sm text-amber-700">
            The stored copy had been changed locally — it no longer matched the
            hash recorded for it. This diff therefore starts from your edited
            copy, not from what was last fetched. Expected if you edited it to
            test; otherwise the snapshot file was corrupted.
          </p>
        }
        @if (page()!.fenceCountChanged) {
          <p class="text-sm text-rose-700">
            The number of fenced code blocks changed — treated as high
            regardless of what the line diff found.
          </p>
        }
        @if (page()!.rewritten) {
          <p class="text-sm text-rose-700">
            Rewritten past the diff cap — read the page itself rather than the
            hunks below.
          </p>
        }

        <dl class="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-1 text-xs">
          <dt class="text-[var(--muted)]">Existing snapshot</dt>
          <dd class="font-mono break-all text-[var(--ink-soft)]">
            {{ short(page()!.previousSha256) }}
          </dd>
          <dt class="text-[var(--muted)]">Newly fetched</dt>
          <dd class="font-mono break-all text-[var(--ink-soft)]">
            {{ short(page()!.sha256) }}
          </dd>
          <dt class="text-[var(--muted)]">Size</dt>
          <dd class="font-mono text-[var(--ink-soft)]">
            {{ page()!.bytes ? page()!.bytes + ' bytes · ' + page()!.lines + ' lines' : '—' }}
          </dd>
        </dl>

        @if (page()!.hunks.length) {
          <p class="text-xs text-[var(--muted)]">
            <span class="font-mono text-rose-700">−</span> existing snapshot
            <span class="ml-3 font-mono text-emerald-700">+</span> newly fetched
          </p>
          <div class="space-y-3">
            @for (hunk of page()!.hunks; track $index) {
              <doc-hunk [hunk]="hunk" />
            }
          </div>
        }
        @if (page()!.droppedHunks) {
          <p class="text-xs text-[var(--muted)]">
            {{ page()!.droppedHunks }} further hunk(s) not shown.
          </p>
        }
      </div>
    }
  `,
})
export class PageComparison {
  readonly page = input<PageReport | undefined>();

  protected short(hash?: string): string {
    return hash ? hash.slice(0, 12) : '—';
  }
}
