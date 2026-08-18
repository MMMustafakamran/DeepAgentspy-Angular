import { Component, afterNextRender, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DocDriftPanel } from '../components/doc-drift-panel';
import {
  CheckMark,
  OUTCOME_TEXT,
  PageComparison,
  SeverityBadge,
} from '../components/doc-sync-ui';
import { Callout, Panel } from '../components/ui';
import { DocSyncClient } from '../lib/doc-sync/client';
import { docTargets, normalizeDocPath } from '../lib/doc-sync/paths';
import type { PageReport } from '../lib/doc-sync/types';
import { NAV, docUrl, type RouteMeta } from '../lib/nav-config';

/**
 * The full drift report.
 *
 * Every tracked section is listed, matched or not — a page that is fine and a
 * page that was never checked have to be distinguishable at a glance, which
 * they are not if the report only prints failures. Each row expands to the
 * comparison behind its check.
 *
 * Rows are plain `<details>`, so expanding costs no JavaScript.
 */
@Component({
  selector: 'app-doc-sync-page',
  imports: [
    RouterLink,
    Callout,
    Panel,
    DocDriftPanel,
    SeverityBadge,
    CheckMark,
    PageComparison,
  ],
  template: `
    <header class="mb-6 border-b border-[var(--line)] pb-5">
      <h1 class="text-2xl font-bold text-[var(--ink)]">Doc drift</h1>
      <p class="mt-2 max-w-3xl text-sm text-[var(--ink-soft)]">
        Fetches the markdown source behind every doc page this repo tracks,
        diffs it against the stored copy in <code>doc-snapshot/</code>, then
        replaces that copy.
      </p>
    </header>

    <div class="space-y-6">
      <doc-drift-panel />

      @if (state(); as s) {
        @if (s.manifestError) {
          <ui-callout tone="warn" title="The manifest could not be read">
            <p>{{ s.manifestError }}</p>
            <p class="mt-1">
              Delete <code>doc-snapshot/manifest.json</code> and re-run to
              rebuild the baseline.
            </p>
          </ui-callout>
        }

        @if (s.report?.aborted; as aborted) {
          <ui-callout tone="warn" title="Run aborted — snapshot left untouched">
            <p>{{ aborted.reason }}</p>
            <p class="mt-1">
              The sync commits all pages or none. A partial snapshot would make
              the next run's diff silently wrong about whichever pages were
              skipped.
            </p>
          </ui-callout>
        }

        @if (s.report && !s.report.aborted && s.report.highest === 'high') {
          <ui-callout tone="warn" title="A change landed inside a code block">
            <p>
              An implementation here may no longer match what its doc page
              teaches. Expand the flagged sections below, reconcile the affected
              routes, and re-run the sync.
            </p>
          </ui-callout>
        }

        <ui-panel heading="Snapshot">
          <dl class="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="font-medium text-[var(--muted)]">Last synced</dt>
            <dd class="text-[var(--ink-soft)]">
              {{ s.manifest ? stamp(s.manifest.syncedAt) : 'never — no snapshot yet' }}
            </dd>
            <dt class="font-medium text-[var(--muted)]">Doc pages tracked</dt>
            <dd class="text-[var(--ink-soft)]">{{ tracked }}</dd>
            <dt class="font-medium text-[var(--muted)]">Last run</dt>
            <dd class="text-[var(--ink-soft)]">
              {{ s.report ? s.report.durationMs + 'ms · ' + s.report.pages.length + ' checked' : '—' }}
            </dd>
          </dl>
        </ui-panel>
      }

      <ui-panel heading="Sections checked">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          Every doc page this repo tracks, in nav order. Expand a row to compare
          the stored copy against the one just fetched.
        </p>
        <div class="space-y-6">
          @for (group of nav; track group.title) {
            <div>
              <h3 class="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                {{ group.title }}
              </h3>
              <div class="mt-2 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                @for (route of group.routes; track route.path) {
                  <details class="group">
                    <summary
                      class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                    >
                      <span
                        aria-hidden="true"
                        class="w-3 shrink-0 font-mono text-xs text-[var(--muted)] transition-transform select-none group-open:rotate-90"
                        >▸</span
                      >
                      <doc-check-mark [outcome]="reportFor(route)?.outcome" />
                      <span class="font-medium text-[var(--ink)]">{{ route.title }}</span>
                      <code class="font-mono text-xs text-[var(--muted)]">{{ route.path }}</code>
                      @if (reportFor(route); as page) {
                        @if (page.severity !== 'none') {
                          <doc-severity-badge [severity]="page.severity" />
                        }
                      }
                      <span class="ml-auto text-xs text-[var(--muted)]">{{ outcomeText(route) }}</span>
                    </summary>
                    <div class="border-t border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-3">
                      <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <a
                          [href]="docUrl(route)"
                          target="_blank"
                          rel="noreferrer"
                          class="text-[var(--accent)] underline underline-offset-4"
                          >doc page ↗</a
                        >
                        <a
                          [routerLink]="route.path"
                          class="text-[var(--accent)] underline underline-offset-4"
                          >open route</a
                        >
                        <code class="font-mono text-[var(--muted)]">{{
                          normalize(route.docPath)
                        }}</code>
                      </div>
                      <doc-comparison [page]="reportFor(route)" />
                    </div>
                  </details>
                }
              </div>
            </div>
          }
        </div>
      </ui-panel>

      @if (state()?.report; as report) {
        @if (report.sitemap.newUnmapped.length || report.sitemap.confirmedRemoved.length) {
          <ui-panel heading="Nav drift">
            @if (report.sitemap.confirmedRemoved.length) {
              <h4 class="text-xs font-semibold tracking-wide text-rose-700 uppercase">
                Removed upstream
              </h4>
              <p class="mt-1 text-sm text-[var(--ink-soft)]">
                These 404 on the markdown endpoint <em>and</em> are absent from
                the sitemap. A 404 on its own is more often a site quirk than a
                deletion, so both signals are required.
              </p>
              <ul class="mt-2 space-y-1">
                @for (url of report.sitemap.confirmedRemoved; track url) {
                  <li class="font-mono text-xs text-[var(--ink-soft)]">{{ url }}</li>
                }
              </ul>
            }
            @if (report.sitemap.newUnmapped.length) {
              <h4 class="mt-4 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                New upstream, no route here ({{ report.sitemap.newUnmapped.length }})
              </h4>
              <p class="mt-1 text-sm text-[var(--ink-soft)]">
                Listed once, then folded into the manifest's
                <code>knownUnmapped</code> so they stop being reported. Prune
                that list by hand as you add routes.
              </p>
              <ul class="mt-2 space-y-1">
                @for (url of report.sitemap.newUnmapped; track url) {
                  <li class="font-mono text-xs text-[var(--ink-soft)]">{{ url }}</li>
                }
              </ul>
            }
          </ui-panel>
        }
      }
    </div>
  `,
})
export default class DocSyncPage {
  private readonly client = inject(DocSyncClient);
  protected readonly state = this.client.state;
  protected readonly nav = NAV;
  protected readonly tracked = docTargets().length;
  protected readonly docUrl = docUrl;

  constructor() {
    afterNextRender(() => void this.client.load());
  }

  /**
   * Routes are what you navigate; doc pages are what gets fetched, and several
   * routes can share one. Resolving by normalized docPath is what lets every
   * row find its result.
   */
  protected reportFor(route: RouteMeta): PageReport | undefined {
    const wanted = normalizeDocPath(route.docPath);
    return this.state()?.report?.pages.find((p) => p.docPath === wanted);
  }

  protected outcomeText(route: RouteMeta): string {
    const page = this.reportFor(route);
    return page ? OUTCOME_TEXT[page.outcome] : 'not checked';
  }

  protected normalize(docPath: string): string {
    return normalizeDocPath(docPath);
  }

  protected stamp(iso: string): string {
    return iso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }
}
