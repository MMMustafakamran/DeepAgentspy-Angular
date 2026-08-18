import { Component, afterNextRender, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DocSyncClient } from '../lib/doc-sync/client';
import { docTargets } from '../lib/doc-sync/paths';

import { SeverityBadge } from './doc-sync-ui';
import { Panel } from './ui';

/**
 * The doc-drift summary and its sync button, for the landing page.
 *
 * Self-contained — it reads its own state from `DocSyncClient` rather than
 * taking inputs — so dropping it into a page is a one-line change. That matters
 * because this ships into fifteen sibling repos whose landing pages are
 * otherwise nothing alike.
 *
 * The initial load runs in `afterNextRender` so it never fires during SSR,
 * where a relative `/api/doc-sync` has no origin to resolve against.
 */
@Component({
  selector: 'doc-drift-panel',
  imports: [RouterLink, Panel, SeverityBadge],
  template: `
    <ui-panel heading="Doc drift">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <p class="max-w-xl text-sm text-[var(--ink-soft)]">
          Re-fetch the markdown behind all {{ tracked }} tracked doc pages, diff
          against the stored snapshot, then replace it.
        </p>
        <button
          type="button"
          [disabled]="client.running()"
          (click)="client.run()"
          class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] shadow-sm transition hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          @if (client.running()) {
            <span
              aria-hidden="true"
              class="size-3 animate-spin rounded-full border-2 border-[var(--muted)] border-t-transparent"
            ></span>
            Fetching docs…
          } @else {
            {{ state()?.baseline ? 'Create doc baseline' : 'Sync docs now' }}
          }
        </button>
      </div>

      <div class="mt-4 text-sm">
        @if (client.error()) {
          <p class="text-rose-700">Could not reach the sync endpoint: {{ client.error() }}</p>
        } @else if (!state()) {
          <p class="text-[var(--muted)]">Loading snapshot state…</p>
        } @else if (state()!.baseline) {
          <p class="text-[var(--ink-soft)]">
            No snapshot yet. The first run stores {{ tracked }} pages; from the
            next one on, anything the docs change shows up here — with edits
            inside code blocks ranked highest, since those are the ones that can
            invalidate a route.
          </p>
        } @else {
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <doc-severity-badge [severity]="state()!.report?.highest ?? 'none'" />
            <span class="text-[var(--ink-soft)]">{{ summary() }}</span>
            <a routerLink="/doc-sync" class="text-[var(--accent)] underline underline-offset-4"
              >Full report</a
            >
          </div>
        }
        @if (client.result(); as result) {
          <p class="mt-2 text-xs" [class]="result.ok ? 'text-[var(--muted)]' : 'text-rose-700'">
            {{ result.message }}
          </p>
        }
      </div>
    </ui-panel>
  `,
})
export class DocDriftPanel {
  protected readonly client = inject(DocSyncClient);
  protected readonly state = this.client.state;
  protected readonly tracked = docTargets().length;

  constructor() {
    afterNextRender(() => void this.client.load());
  }

  protected summary(): string {
    const report = this.state()?.report;
    if (!report) return 'Snapshot stored, no run recorded yet.';
    if (report.aborted) return report.aborted.reason;
    const c = report.counts;
    return `${c.changed} changed · ${c.unchanged} unchanged · ${c.missing} missing`;
  }
}
