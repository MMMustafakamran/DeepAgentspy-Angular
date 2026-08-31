/**
 * Human-in-the-loop — the decision tool, where the model chooses to ask.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * The prompt is phrased to make the agent reach for `requestApproval` rather
 * than answer directly; the recording is only worth anything if the card
 * actually appears and the run visibly resumes after the click.
 *
 * The same doc page's interrupt path is recorded separately, by
 * `interrupts.action.ts`. They were one take until 31 Aug 2026, which meant
 * half the frame was a permanently blank panel — this backend raises no
 * interrupts — with nothing on screen saying so.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

export const runHitlAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🛡️ Asking for something consequential enough to need approval...`);
  const msgCount = await sendPrompt(page, config.prompt);

  const approvalCard = page.locator('app-approval-card').first();
  const cardAppeared = await approvalCard
    .waitFor({ state: 'visible', timeout: 25000 })
    .then(() => true)
    .catch(() => false);

  if (!cardAppeared) {
    // Not fatal here: the reply still has to arrive, and the completion wait
    // below is what decides whether this page passed. But the whole point of
    // the page is the pause, so say plainly that it did not happen.
    console.warn(
      `   ⚠️ app-approval-card never appeared — the agent answered without ` +
        `calling requestApproval, so nothing was paused.`,
    );
  } else {
    await sleep(1500);
    const approveBtn = page
      .locator('app-approval-card button:has-text("Approve")')
      .first();

    const box = await approveBtn.boundingBox().catch(() => null);
    if (box) {
      console.log(`   👉 Approving.`);
      await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
      await sleep(600);
      await humanClick(page);
    } else {
      await approveBtn.click().catch(() => {});
    }
  }

  // The decision returns to the agent and the run continues, so the reply that
  // matters is the one after the click.
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
};
