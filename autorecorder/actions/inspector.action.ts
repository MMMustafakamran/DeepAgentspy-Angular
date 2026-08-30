/**
 * Inspector — the panel the framework mounts for you, once something asks it to.
 *
 * https://docs.copilotkit.ai/angular/deepagents/inspector
 *
 * This page is unusual: its subject is an *absence* of code. The claim is that
 * `@copilotkit/angular` creates `cpk-web-inspector` and appends it to
 * `document.body` on its own, so the take has to show the element arriving
 * while nothing in `frontend/src/` put it there.
 *
 * A screenshot of a panel would not establish that — the panel looks the same
 * whether the framework mounted it or a hand-written component did. So the
 * recording is a before/after of the precondition the page omits: read the
 * mount check with `provideCopilotKit` already configured and no CopilotKit
 * consumer on screen (absent), mount a chat, read it again (mounted). The flip
 * is the finding. Then send the message the quickstart's Inspector step asks
 * for, so AG-UI events have something to carry.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { showCaption } from '../core/overlays/caption';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { writeIssueNote } from '../core/issue-note';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

/** Waits for the probe to publish a reading, then returns the state it settled on. */
async function readProbe(page: Page): Promise<string | null> {
  await page
    .waitForFunction(
      () =>
        document
          .querySelector('[data-testid="probe-verdict"]')
          ?.getAttribute('data-state') !== 'pending',
      undefined,
      { timeout: 15000 },
    )
    .catch(() => undefined);

  return page
    .locator('[data-testid="probe-verdict"]')
    .first()
    .getAttribute('data-state')
    .catch(() => null);
}

export const runInspectorAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const verdict = page.locator('[data-testid="probe-verdict"]').first();
  await verdict.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);

  // ── Before: configured, but nothing has injected the service ──────────────
  const before = await readProbe(page);
  const box = await verdict.boundingBox().catch(() => null);
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
  }

  if (before === 'absent') {
    console.log(
      `   🔎 No cpk-web-inspector yet — provideCopilotKit is configured and the ` +
        `Inspector is still not on the page.`,
    );
    await showCaption(
      page,
      'provideCopilotKit is already configured — and there is no Inspector',
      'bad',
    );
  } else {
    // Not the expected starting point, so say so rather than narrating a
    // before/after that did not happen.
    console.warn(
      `   ⚠️ Expected the mount check to read 'absent' before a chat is ` +
        `mounted; it read '${before}'. The precondition this take documents ` +
        `may have been fixed, or something else mounted a consumer first.`,
    );
  }
  await sleep(3000);

  // ── After: mount a CopilotKit consumer and watch the element arrive ───────
  const mountButton = page.locator('[data-testid="mount-chat"]').first();
  if (await mountButton.isVisible().catch(() => false)) {
    const mountBox = await mountButton.boundingBox().catch(() => null);
    if (mountBox) {
      await humanGlide(
        page,
        mountBox.x + mountBox.width / 2,
        mountBox.y + mountBox.height / 2,
        22,
      );
      await sleep(500);
      await humanClick(page);
    } else {
      await mountButton.click().catch(() => {});
    }
  }

  const after = await readProbe(page);
  const count = await page
    .locator('[data-testid="probe-count"]')
    .first()
    .textContent()
    .catch(() => null);

  switch (after) {
    case 'mounted':
      console.log(
        `   ✅ After mounting a chat: ${count?.trim() ?? '?'} cpk-web-inspector ` +
          `element, appended by the framework. No Inspector code in this app.`,
      );
      await showCaption(
        page,
        'Mounting a chat injects the CopilotKit service — now the Inspector exists',
        'good',
      );
      break;
    case 'duplicate':
      console.warn(
        `   ⚠️ ${count?.trim() ?? '?'} cpk-web-inspector elements. The guide's ` +
          `hand-written-mount hazard is reproducing, or something else creates one.`,
      );
      break;
    default:
      console.warn(
        `   ⚠️ The mount check read '${after}' even after a chat was mounted, ` +
          `so the framework never appended the element on this run.`,
      );
  }
  await sleep(3000);

  // The second half of the documented step: the Inspector is only shown to be
  // live if traffic actually moves through it.
  console.log(`   💬 Sending a message so AG-UI events have something to show...`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(
    page,
    config.waitAfterPromptMs ?? 4000,
    msgCount,
  ).catch(() => {
    // Agent silence is not this page's finding; the mount behaviour above is.
    console.warn(`   ⚠️ No reply arrived, which is not what this page is testing.`);
  });

  if (config.knownIssue) {
    await writeIssueNote(page, config.id, config.knownIssue);
  }
};
