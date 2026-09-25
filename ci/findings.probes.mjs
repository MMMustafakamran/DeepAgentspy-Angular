/**
 * Finding probes: one entry per open FINDINGS.md item that a package update
 * could fix on its own. Each probe compiles the verbatim doc code and proves
 * the defect is still there. When `expect` stops matching, the finding may
 * have been fixed upstream -- a human then re-checks and edits FINDINGS.md.
 *
 * Keyed by FINDINGS.md number. Commands and evidence mirror
 * autorecorder/actions/compile-casts.ts (the compile-error clip), but use
 * `ng build`, which exits, instead of `ng serve`. Keep the two in step if a
 * configuration or error text changes.
 */
import { FRONTEND_DIR } from './lib/config.mjs';

export const PROBES = {
  1: {
    id: 1,
    title: 'A2UI: doc snippet references undefined names',
    page: '/a2ui',
    kind: 'compile',
    command: 'npx ng build --configuration doc-a2ui',
    cwd: FRONTEND_DIR,
    code: 'TS2304',
    expect: [/TS2304/, /Cannot find name 'dynamicString'/],
    timeoutMs: 300_000,
  },
};
