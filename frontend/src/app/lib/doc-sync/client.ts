import { Injectable, signal } from '@angular/core';

import type { DocSyncReport, SyncResult } from './types';

/**
 * The browser half of the doc-sync feature.
 *
 * Everything that fetches docs or touches the snapshot runs on the server; this
 * only talks to `/api/doc-sync`. Nothing here may import `store.ts`,
 * `fetch-docs.ts` or `run-sync.ts`, or `node:fs` would follow them into the
 * browser bundle — the type-only import above is deliberate.
 *
 * Provided in root so the landing-page panel and the report page share one
 * state: syncing from either updates both without a reload.
 */
export interface DocSyncState {
  manifest: { syncedAt: string; pages: number; urlsUnderRoot: number } | null;
  manifestError: string | null;
  baseline: boolean;
  report: DocSyncReport | null;
}

@Injectable({ providedIn: 'root' })
export class DocSyncClient {
  readonly state = signal<DocSyncState | null>(null);
  readonly loading = signal(false);
  readonly running = signal(false);
  readonly result = signal<SyncResult | null>(null);
  readonly error = signal<string | null>(null);

  /** Safe to call repeatedly; the report page and the landing panel both do. */
  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      const res = await fetch('/api/doc-sync', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.state.set((await res.json()) as DocSyncState);
      this.error.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  async run(): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    this.result.set(null);
    try {
      const res = await fetch('/api/doc-sync/run', { method: 'POST' });
      const result = (await res.json()) as SyncResult;
      this.result.set(result);
      this.error.set(null);
      // Re-read rather than trusting the run's summary: the report on disk is
      // what the page renders, and it is the thing that must agree with the UI.
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.running.set(false);
    }
  }
}
