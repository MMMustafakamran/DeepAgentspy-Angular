/**
 * Human-in-the-loop — the run pauses until a human answers.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * Two halves, and they end differently.
 *
 * The tool path works: the prompt is phrased to make the agent reach for
 * `requestApproval` rather than answer directly, and the recording is only
 * worth anything if the card actually appears and the run visibly resumes
 * after the click.
 *
 * The interrupt path is what 0.4.0 rewrote, and it carries this page's defect.
 * The guide now documents two controllers — the agent store's own
 * `interruptController` and a typed `injectInterrupt` one — and warns against
 * rendering both for the same decision. The demo enforces that with a switch,
 * so the second part of the take flips between them to show only one is ever
 * mounted. It then reports the defect: the store snippet ends with
 * `injectAgentStore("ticketing")`, an agent nothing in these docs defines, and
 * throws when pasted as published.
 *
 * Neither controller renders anything here — the DeepAgents agent in this repo
 * emits no AG-UI interrupt — so the switch and the source are the only things
 * a clip can show, which is why the note matters on this page.
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

export const runHitlAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  // ── Half one: the decision tool, which works ──────────────────────────────
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
    // the page is the interrupt, so say plainly that it did not happen.
    console.warn(
      `   ⚠️ app-approval-card never appeared — the agent answered without ` +
        `calling requestApproval, so nothing was paused.`,
    );
  } else {
    await sleep(1500);
    console.log(`   👉 Approving.`);
    await clickLikeAPerson(page, 'app-approval-card button:has-text("Approve")');
  }

  // The decision returns to the agent and the run continues, so the reply that
  // matters is the one after the click.
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);

  // ── Half two: the two interrupt controllers 0.4.0 documents ───────────────
  const pathSwitch = page.locator('[data-testid="interrupt-path"]').first();
  if (await pathSwitch.isVisible().catch(() => false)) {
    await sleep(1200);
    await showCaption(
      page,
      '0.4.0 documents two interrupt controllers — and warns against rendering both',
      'neutral',
    );

    // Default is the store controller. Count both panels either side of the
    // switch, so the clip shows the exclusivity rather than asserting it.
    const storeFirst = await page.locator('app-store-interrupt-panel').count();
    const typedFirst = await page.locator('app-interrupt-panel').count();
    console.log(
      `   🔀 Store path mounted: store=${storeFirst} typed=${typedFirst} ` +
        `(the guide's default).`,
    );

    await sleep(2000);
    await clickLikeAPerson(page, '[data-testid="interrupt-path-typed"]');
    await sleep(1800);

    const storeAfter = await page.locator('app-store-interrupt-panel').count();
    const typedAfter = await page.locator('app-interrupt-panel').count();
    console.log(
      `   🔀 Typed path mounted: store=${storeAfter} typed=${typedAfter}.`,
    );

    if (storeFirst + typedFirst === 1 && storeAfter + typedAfter === 1) {
      await showCaption(
        page,
        'Exactly one controller is ever mounted — the unsupported state is unreachable',
        'good',
      );
    } else {
      console.warn(
        `   ⚠️ Expected exactly one panel mounted per path; saw ` +
          `${storeFirst + typedFirst} then ${storeAfter + typedAfter}.`,
      );
    }
    await sleep(2500);

    // Back to the store path, which is the one the defect is about, so the
    // note below is typed over the code it describes.
    await clickLikeAPerson(page, '[data-testid="interrupt-path-store"]');
    await sleep(1500);
  } else {
    console.warn(
      `   ⚠️ The interrupt-path switch was not found, so this take does not ` +
        `show the two controllers 0.4.0 added.`,
    );
  }

  // ── The defect ────────────────────────────────────────────────────────────
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
