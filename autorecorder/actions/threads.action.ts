/**
 * Threads — both surfaces from the guide, working, filmed in the order a
 * reader meets them.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/threads-memory-attachments-headless
 *
 * `frontend/server.ts` passes `intelligence` to `CopilotRuntime`, so the
 * hand-built `injectThreads` list and `CopilotThreadsDrawer` both resolve real
 * threads. The finding is what the guide leaves out — it never mentions
 * Intelligence or a project API key — and that lives in the report, not on
 * screen. This clip carries no Notepad note and no voiceover: it shows the
 * feature, and the bare-button list the guide publishes is visible as-is.
 *
 * Order: the list first, then a message so a thread is created and named, then
 * that thread selected from the drawer.
 */
import { type Page } from 'playwright';

import { AgentSilentError, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { beat, humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

/** Clicks a control if it is there, and says so if it is not. */
async function clickIfPresent(page: Page, selector: string, label: string): Promise<boolean> {
  const el = page.locator(selector).first();
  const box = await el
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => el.boundingBox())
    .catch(() => null);

  if (!box) {
    console.log(`   · ${label} not present.`);
    return false;
  }

  await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
  await sleep(250);
  await humanClick(page);
  await beat(1000);
  return true;
}

export const runThreadsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const list = page.locator('app-thread-list').first();
  await list.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await sleep(600);

  // ── The hand-built list ──────────────────────────────────────────────────
  const listBox = await list.boundingBox().catch(() => null);
  if (listBox) {
    await humanGlide(page, listBox.x + Math.min(listBox.width / 2, 160), listBox.y + 20, 22);
    await beat(1800);
  }
  const listed = ((await list.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  console.log(`   🧵 injectThreads list renders: "${listed.slice(0, 120)}"`);

  console.log(`   🧵 Starting a conversation from the guide's own button...`);
  await clickIfPresent(page, 'app-thread-list button:has-text("New conversation")', 'New conversation');
  await clickIfPresent(page, 'app-thread-list button:has-text("Retry")', 'Retry');

  // ── A message, so the thread is created and named ────────────────────────
  console.log(`   💬 Sending a message so the thread gets created and named...`);
  const msgCount = await sendPrompt(page, config.prompt, {
    inputSelector: 'app-conversations textarea',
    submitSelector: 'app-conversations copilot-chat-send-button button',
  });
  try {
    await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  } catch (e) {
    if (!(e instanceof AgentSilentError)) throw e;
    console.warn(`   ⚠️ The chat did not answer.`);
  }
  await beat(1500);

  // ── The drawer lists it; select it ───────────────────────────────────────
  // Waited for, not read once: the drawer fills in after its own request, so
  // an immediate innerText read reports it empty when it is not.
  const entry = page
    .locator('copilot-threads-drawer button, copilot-threads-drawer [role="button"]')
    .filter({ hasNotText: 'New Conversation' })
    .first();
  const entryBox = await entry
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => entry.boundingBox())
    .catch(() => null);

  if (entryBox) {
    const name = ((await entry.innerText().catch(() => '')) || '').trim();
    console.log(`   🧵 Selecting "${name.slice(0, 60)}" from CopilotThreadsDrawer...`);
    await humanGlide(page, entryBox.x + entryBox.width / 2, entryBox.y + entryBox.height / 2, 22);
    await sleep(350);
    await humanClick(page);
    await beat(2200);
  } else {
    console.log(`   🐞 CopilotThreadsDrawer listed no thread within 10s.`);
  }

  // ── Back to the list, which now carries the new thread ───────────────────
  if (listBox) {
    await humanGlide(page, listBox.x + Math.min(listBox.width / 2, 160), listBox.y + 20, 22);
    await beat(2400);
  }
};
