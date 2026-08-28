/**
 * Frontend tools and generative UI — the two halves of the guide, one turn each.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/frontend-tools-generative-ui
 *
 * Turn 1 calls `getWeather`, which runs in the DeepAgents graph
 * (backend/main.py); the browser only renders it, through `app-weather-card`.
 * Turn 2 calls `change_background`, which runs in the browser and renders
 * nothing in chat — its result is the page itself repainting, so the cursor
 * has to go and look at the page.
 *
 * ── One difference from the sibling repos ──────────────────────────────────
 * This demo mounts `<copilot-sidebar />`, not an inline `<copilot-chat />`
 * (features/tools/tools-chat.component.ts). A sidebar starts closed behind a
 * launcher, so there is no composer in the DOM until it is opened — typing
 * straight away lands nowhere and the take fails as "the agent never replied"
 * on a page that works. Opening it is the first thing this handler does.
 *
 * ── Watch the weather card ─────────────────────────────────────────────────
 * The graph declares `getWeather(location: str)` while the renderer binds
 * `call.args.city`, so the card can mount with an empty heading even when the
 * agent answers correctly. The QA report scores this page as passing and
 * records no symptom, so there is no `knownIssue` here — but if the card looks
 * wrong on the clip, that mismatch is why.
 */
import { type Page } from 'playwright';

import { promptsFor, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { waitForDomSettled } from './page-ready';

/**
 * Opens the sidebar if it is closed.
 *
 * Returns quietly when a composer is already on screen: some builds render the
 * sidebar open, and clicking a launcher that is not there would throw.
 */
async function ensureSidebarOpen(page: Page): Promise<void> {
  const composer = page.locator('copilot-sidebar textarea, copilot-chat textarea').first();
  if (await composer.isVisible({ timeout: 2500 }).catch(() => false)) {
    console.log(`   · Sidebar already open.`);
    return;
  }

  const launcher = page
    .locator(
      'copilot-sidebar button[aria-label*="open" i], copilot-sidebar button[aria-label*="chat" i], ' +
        'button[aria-label*="Open Copilot" i], copilot-sidebar button',
    )
    .first();

  const box = await launcher
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => launcher.boundingBox())
    .catch(() => null);

  if (!box) {
    console.warn(`   ⚠️ No sidebar launcher found — continuing and hoping for a composer.`);
    return;
  }

  console.log(`   🗂️ Opening the sidebar...`);
  await humanGlide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
  await sleep(350);
  await humanClick(page);

  // Opening the sidebar constructs the chat. That is first load all over again:
  // the markup lands before the composer is wired up.
  await waitForDomSettled(page);
  await sleep(600);
}

export const runToolsAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const [weatherPrompt, backgroundPrompt] = promptsFor(config);
  const wait = config.waitAfterPromptMs ?? 4000;

  await ensureSidebarOpen(page);

  // ── Server-side tool, rendered by an Angular component ────────────────────
  console.log(`   🌤️ Server tool: ${weatherPrompt}`);
  const firstCount = await sendPrompt(page, weatherPrompt);

  // The card appears while the reply is still streaming; waiting for it here
  // separates "the tool renderer mounted" from "the turn finished", so a broken
  // renderer is visible as its own failure instead of a silent absence.
  const weatherCard = page.locator('app-weather-card').first();
  await weatherCard.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {
    console.warn(`   ⚠️ app-weather-card never rendered — tool call may not have fired.`);
  });

  await waitForAgentResponseCompletion(page, wait, firstCount);

  const cardBox = await weatherCard.boundingBox().catch(() => null);
  if (cardBox) {
    await humanGlide(page, cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, 22);
    await sleep(2200);
  }

  // ── Browser-side tool, whose only output is the page repainting ───────────
  if (!backgroundPrompt) return;
  console.log(`   🎨 Frontend tool: ${backgroundPrompt}`);
  const secondCount = await sendPrompt(page, backgroundPrompt);
  await waitForAgentResponseCompletion(page, 3000, secondCount);

  console.log(`   ✨ Showing the repainted background.`);
  await humanGlide(page, 500, 350, 25);
  await sleep(1000);
  await humanGlide(page, 700, 520, 25);
  await sleep(2000);
};
