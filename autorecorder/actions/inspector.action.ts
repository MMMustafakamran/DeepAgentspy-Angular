/**
 * Inspector — the panel the framework mounts for you.
 *
 * https://docs.copilotkit.ai/angular/deepagents/inspector
 *
 * The page's claim is that `@copilotkit/angular` creates `cpk-web-inspector`
 * and appends it to `document.body` itself, with nothing in the application
 * doing the mounting. So the take does what a person checking that would do:
 * open the page, see whether the Inspector is there, then use it.
 *
 * An earlier version clicked a button to mount a chat and filmed the element
 * appearing. That staged a framework internal nobody testing this page would
 * think to exercise, so it is gone: the chat is simply on the route, the way a
 * real application would have it.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

export const runInspectorAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const verdict = page.locator('[data-testid="probe-verdict"]').first();
  await verdict.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);

  // The element is appended after the first browser render, so the probe reads
  // 'pending' for a moment. Waiting for it to settle is the difference between
  // filming the answer and filming the wait.
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

  const state = await verdict.getAttribute('data-state').catch(() => null);
  const count = await page
    .locator('[data-testid="probe-count"]')
    .first()
    .textContent()
    .catch(() => null);

  const box = await verdict.boundingBox().catch(() => null);
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
  }
  await sleep(2500);

  switch (state) {
    case 'mounted':
      console.log(
        `   🔎 ${count?.trim() ?? '?'} cpk-web-inspector element, appended by the ` +
          `framework. Nothing in this app creates it.`,
      );
      break;
    case 'duplicate':
      console.warn(
        `   ⚠️ ${count?.trim() ?? '?'} cpk-web-inspector elements — the guide's ` +
          `hand-written-mount hazard, or something else creating one.`,
      );
      break;
    case 'absent':
      console.warn(
        `   ⚠️ No cpk-web-inspector element in the document, though a CopilotKit ` +
          `component is on this route.`,
      );
      break;
    default:
      console.warn(`   ⚠️ The mount check never settled, so nothing was confirmed.`);
  }

  // Open the Inspector itself — the actual subject of the page, and what the
  // quickstart's closing step tells a reader to click.
  const inspector = page.locator('cpk-web-inspector').first();
  const inspectorBox = await inspector.boundingBox().catch(() => null);
  if (inspectorBox && inspectorBox.width > 0 && inspectorBox.height > 0) {
    console.log(`   🖱️ Opening the Inspector.`);
    await humanGlide(
      page,
      inspectorBox.x + inspectorBox.width / 2,
      inspectorBox.y + inspectorBox.height / 2,
      22,
    );
    await sleep(400);
    await humanClick(page);
    await sleep(2500);
  } else {
    console.log(
      `   · The Inspector renders its launcher in a shadow root with no ` +
        `measurable box, so it is left as the framework drew it.`,
    );
  }

  // The quickstart's step is not satisfied by a static panel: it asks for a
  // message, so AG-UI events have something to carry.
  console.log(`   💬 Sending a message so the Inspector has traffic to show...`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(
    page,
    config.waitAfterPromptMs ?? 4000,
    msgCount,
  );
};
