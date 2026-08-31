/**
 * Interrupts — the half of the human-in-the-loop page where the backend agent,
 * not the model, chooses the pause.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * Nothing on this route can be made to fire: this backend emits no AG-UI
 * interrupt and no legacy `on_interrupt` event, so both controllers stay blank
 * for the whole take. That is the reason the route exists separately, and the
 * reason this handler does what it does — an idle headless panel and a broken
 * one are pixel-identical, so a clip that just sits on a blank panel proves
 * nothing either way.
 *
 * What it can show is structural, and all three parts are on screen:
 *   1. exactly one controller is mounted at a time, which is the rule 0.4.0
 *      added and the demo enforces;
 *   2. the route states its own idleness, so blank is legible rather than
 *      ambiguous;
 *   3. the published store snippet cannot run at all — the defect, typed out
 *      over the code it describes.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { showCaption } from '../core/overlays/caption';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { writeIssueNote } from '../core/issue-note';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

/** Glides to a control and clicks it the way a person would, if it is there. */
async function clickLikeAPerson(page: Page, selector: string): Promise<boolean> {
  const target = page.locator(selector).first();
  if (!(await target.isVisible().catch(() => false))) return false;

  const box = await target.boundingBox().catch(() => null);
  if (box) {
    await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
    await sleep(400);
    await humanClick(page);
  } else {
    await target.click().catch(() => {});
  }
  return true;
}

/** How many interrupt panels are in the DOM right now, by kind. */
async function panelCounts(page: Page): Promise<{ store: number; typed: number }> {
  return {
    store: await page.locator('app-store-interrupt-panel').count(),
    typed: await page.locator('app-interrupt-panel').count(),
  };
}

export const runInterruptsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  // ── Start a run, so the controllers are live rather than merely rendered ──
  console.log(`   💬 Starting a run so the controllers are attached to something...`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(
    page,
    config.waitAfterPromptMs ?? 3000,
    msgCount,
  ).catch(() => {
    // The reply is scene-setting. Whether the agent answered is not the
    // finding, and losing the take to it would throw away the point.
    console.warn(`   ⚠️ No reply arrived; not what this page is testing.`);
  });

  // ── 1. Exactly one controller at a time ──────────────────────────────────
  const pathSwitch = page.locator('[data-testid="interrupt-path"]').first();
  if (await pathSwitch.isVisible().catch(() => false)) {
    await showCaption(
      page,
      '0.4.0 documents two interrupt controllers — and warns against rendering both',
      'neutral',
    );

    const first = await panelCounts(page);
    console.log(
      `   🔀 Store path mounted: store=${first.store} typed=${first.typed} (the guide's default).`,
    );
    await sleep(2000);

    await clickLikeAPerson(page, '[data-testid="interrupt-path-typed"]');
    await sleep(1800);

    const second = await panelCounts(page);
    console.log(`   🔀 Typed path mounted: store=${second.store} typed=${second.typed}.`);

    if (first.store + first.typed === 1 && second.store + second.typed === 1) {
      await showCaption(
        page,
        'Exactly one controller is ever mounted — the unsupported state is unreachable',
        'good',
      );
    } else {
      console.warn(
        `   ⚠️ Expected exactly one panel per path; saw ` +
          `${first.store + first.typed} then ${second.store + second.typed}.`,
      );
    }
    await sleep(2500);

    // Back to the store path: it is the one the defect is about, so the note
    // below is typed over the code it describes.
    await clickLikeAPerson(page, '[data-testid="interrupt-path-store"]');
    await sleep(1500);
  } else {
    console.warn(
      `   ⚠️ The interrupt-path switch was not found, so this take cannot show ` +
        `the two controllers 0.4.0 added.`,
    );
  }

  // ── 2. Say why both panels are blank ─────────────────────────────────────
  const idle = page.locator('[data-testid="interrupt-idle"]').first();
  if (await idle.isVisible().catch(() => false)) {
    const box = await idle.boundingBox().catch(() => null);
    if (box) {
      await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
    }
    console.log(
      `   · Both controllers are mounted and listening; this backend raises no ` +
        `interrupt, so neither renders.`,
    );
    await showCaption(
      page,
      'Both are mounted and listening — this backend simply never interrupts',
      'neutral',
    );
    await sleep(3000);
  }

  // ── 3. The defect ────────────────────────────────────────────────────────
  if (config.knownIssue) {
    await showCaption(
      page,
      'The store snippet cannot run as published: injectAgentStore("ticketing")',
      'bad',
    );
    await sleep(2500);
    await writeIssueNote(page, config.id, config.knownIssue);
  }
};
