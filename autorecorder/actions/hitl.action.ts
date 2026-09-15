/**
 * Human-in-the-loop — the decision tool, where the model chooses to ask.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/human-in-the-loop
 *
 * The take is only worth anything if the card actually appears and the run
 * visibly resumes after the click. Getting there is not a given: the guide
 * registers `requestApproval` with the description "Ask the user before a
 * consequential action" and stops there, and the page's own framing is "use a
 * tool when the model should decide whether to ask". Nothing in the published
 * setup tells the model *when* to reach for it, so whether the run pauses is
 * the model's call, and it is not a reliable one.
 *
 * So the page is driven in up to two turns:
 *
 *   1. An operational request the agent can plausibly carry out, phrased the
 *      way the guide implies -- do the thing, but check first. This is the
 *      turn that should work.
 *   2. Only if turn 1 produced no card: the same request with the tool named
 *      outright. This is a nudge the docs never mention needing.
 *
 * Turn 2 is conditional rather than unconditional on purpose. Sending it every
 * time would cost a minute per take, and -- the part that matters -- it would
 * erase the signal. Needing the nudge is itself a finding about the guide, so
 * a take that only paused after being told the tool's name reports `PASS*`
 * with that sentence on it, and a take that never paused at all still fails.
 *
 * The page's other half -- the interrupt controller -- is on the same route,
 * mounted above the chat. It cannot be made to fire: this backend emits no
 * AG-UI interrupt, so the panel stays blank for the whole take. The route
 * states that itself, which is what the pass over it at the end is for; a
 * headless panel that is idle looks exactly like one that has failed.
 *
 * What this take still cannot tell you is *why* a card is missing. It reads
 * the DOM, so "the model never called the tool", "the call landed but the
 * renderer never mounted" and "the run errored" are one observation. The React
 * build of this page reads the AG-UI wire (`core/agui-tap.ts`) and can
 * separate them; that is not ported here yet.
 */
import { type Page } from 'playwright';

import {
  AgentSilentError,
  promptsFor,
  sendPrompt,
  waitForAgentResponseCompletion,
} from '../core/actions';
import { beat, humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type ActionContext, type PageActionHandler, type PageRecordConfig } from '../core/types';

/** The renderer the guide registers; the only thing that proves a pause. */
const APPROVAL_CARD = 'app-approval-card';

/**
 * Waits out a turn that produced no card.
 *
 * `AgentSilentError` is caught rather than allowed to propagate: an escaping
 * exception ends the take, and the escalation turn is the whole point of
 * having a first turn that is allowed to miss. Silence is reported and the
 * take carries on.
 */
async function settleUnpausedTurn(
  page: Page,
  config: PageRecordConfig,
  ctx: ActionContext,
  msgCount: number,
  turn: number,
): Promise<void> {
  try {
    await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  } catch (e) {
    if (!(e instanceof AgentSilentError)) throw e;
    ctx.warn(`The agent never answered turn ${turn} at all.`);
  }
}

export const runHitlAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
  _rootPath,
  ctx,
) => {
  const prompts = promptsFor(config);
  let pausedOnTurn = 0;
  let msgCount = 0;

  for (let turn = 1; turn <= prompts.length; turn++) {
    const prompt = prompts[turn - 1];

    if (turn === 1) {
      console.log(`   🛡️ Asking for something consequential enough to need approval...`);
    } else {
      console.log(`   🛡️ No card yet -- turn ${turn}, naming the tool outright...`);
    }

    msgCount = await sendPrompt(page, prompt);

    const appeared = await page
      .locator(APPROVAL_CARD)
      .first()
      .waitFor({ state: 'visible', timeout: 25000 })
      .then(() => true)
      .catch(() => false);

    if (appeared) {
      pausedOnTurn = turn;
      break;
    }

    // Let the answer it gave instead finish on camera. Whether that unanswered
    // request is a defect is decided after the loop, once it is known whether
    // any later turn got through.
    await settleUnpausedTurn(page, config, ctx, msgCount, turn);
    await beat(1200);
  }

  if (pausedOnTurn === 0) {
    // Not fatal at the point of discovery: the clip is filmed to the end either
    // way. But the whole point of the page is the pause, so say plainly that it
    // never happened.
    ctx.fail(
      `app-approval-card never appeared after ${prompts.length} turn(s) -- the agent ` +
        'answered without calling requestApproval, so nothing was paused.',
    );
  } else {
    await beat(1500);
    const approveBtn = page
      .locator(`${APPROVAL_CARD} button:has-text("Approve")`)
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

    // The decision returns to the agent and the run continues, so the reply
    // that matters is the one after the click.
    await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);

    if (pausedOnTurn > 1) {
      ctx.warn(
        'The guide\'s registerHumanInTheLoop setup did not bind on its own: the agent ' +
          `only called requestApproval on turn ${pausedOnTurn}, after the prompt named the ` +
          'tool. As published, whether a consequential action pauses is left to the model, ' +
          'and the page never says the tool description or the backend prompt has to steer it.',
      );
    }
  }

  // The interrupt half. Nothing to drive -- just make it legible that the
  // blank panel is mounted and listening rather than broken.
  const idle = page.locator('[data-testid="interrupt-idle"]').first();
  if (await idle.isVisible().catch(() => false)) {
    const box = await idle.boundingBox().catch(() => null);
    if (box) {
      await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 20);
    }
    console.log(
      `   · Interrupt controller is mounted and listening; this backend raises ` +
        `none, so it never renders.`,
    );
    await beat(3000);
  }
};
