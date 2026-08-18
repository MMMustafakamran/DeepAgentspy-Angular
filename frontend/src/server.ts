import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Doc drift endpoints.
 *
 * Angular has no server-action equivalent, so the boundary between the page and
 * the sync is plain HTTP. These handlers are the only importers of the modules
 * that touch `node:fs` and the network, which is what keeps them out of the
 * browser bundle.
 *
 * They live on the SSR server rather than the Copilot Runtime because this is
 * the Angular app's own server: `ng serve` routes through it in development
 * (`ssr.entry` in angular.json) and it is what ships in `dist/`, so the button
 * works in both without a second process.
 */
app.get('/api/doc-sync', async (_req, res) => {
  const { readLatestReport, readManifest } = await import(
    './app/lib/doc-sync/store'
  );
  const [manifestState, report] = await Promise.all([
    readManifest(),
    readLatestReport(),
  ]);

  res.json({
    manifest:
      manifestState.kind === 'ok'
        ? {
            syncedAt: manifestState.manifest.syncedAt,
            pages: Object.keys(manifestState.manifest.pages).length,
            urlsUnderRoot: manifestState.manifest.sitemap.urlsUnderRoot ?? 0,
          }
        : null,
    manifestError: manifestState.kind === 'error' ? manifestState.error : null,
    baseline: manifestState.kind === 'absent',
    report,
  });
});

app.post('/api/doc-sync/run', async (_req, res) => {
  const { runDocSync } = await import('./app/lib/doc-sync/run-sync');
  try {
    res.json(await runDocSync());
  } catch (error) {
    // Nothing in the sync is meant to throw; if something does, the snapshot
    // was left untouched by the all-or-nothing commit, so say so plainly
    // rather than returning a 500 the UI cannot explain.
    res.status(500).json({
      ok: false,
      baseline: false,
      message: error instanceof Error ? error.message : String(error),
      changed: 0,
      highest: 'none',
    });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
