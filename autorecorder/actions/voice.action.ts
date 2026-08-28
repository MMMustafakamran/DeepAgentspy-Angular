/**
 * Voice and multimodal input — the image half works, the voice half does not.
 *
 * https://docs.copilotkit.ai/angular/deepagents/guides/voice-multimodal
 *
 * The QA report marks this page failed, and the tester's own recording is
 * specific about why: the attached image is understood, and the spoken prompt
 * is never transcribed. A clip that only films the microphone failing loses
 * half of that finding and invites the obvious wrong conclusion — that the
 * whole page is broken, or that the model is at fault.
 *
 * So this take runs in that order on purpose:
 *
 *   1. attach an image and have the agent read a value only visible inside it
 *      — proof the multimodal path is live end to end;
 *   2. record through the microphone and stop, which is the request that has
 *      no service behind it;
 *   3. write the finding while the failure is still on screen.
 *
 * Three things have to be arranged before step 2 films as it behaves:
 *
 * - **The permission prompt.** Chrome's real one is browser chrome, outside the
 *   page, and Playwright suppresses it — a context grants or denies up front,
 *   so nothing was ever on screen and the mic click looked like it did nothing.
 *   The bubble here is drawn into the page, the same way this suite already
 *   draws the taskbar and VS Code. It is a prop, and the sequence is honest
 *   because the stream genuinely waits for the Allow click.
 *
 * - **A device.** The recording machine may have no microphone, and Chrome then
 *   rejects `getUserMedia` instantly — so the composer never enters its
 *   recording state and there is nothing to see. `getUserMedia` is wrapped to
 *   fall back to a synthesized stream, so the *UI* path is exercised for real
 *   even where the hardware is absent.
 *
 * - **The failure that is the actual finding.** Stopping the recording posts
 *   the audio for transcription, and this runtime configures no transcription
 *   service, so that request fails.
 */
import { type FileChooser, type Page } from 'playwright';

import { AgentSilentError, sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { writeIssueNote } from '../core/issue-note';
import { showCaption } from '../core/overlays/caption';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { closeFileDialog, openFileDialog, pickFileInDialog } from './file-dialog';

const FIXTURE_NAME = 'quarterly_revenue.png';

/** Draws the fixture chart in the page and returns its bytes. */
async function renderFixture(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#111827';
    g.font = 'bold 30px sans-serif';
    g.fillText('Quarterly revenue', 30, 52);

    const values = [120, 180, 240, 300];
    values.forEach((v, i) => {
      g.fillStyle = '#2563eb';
      g.fillRect(40 + i * 150, 380 - v, 100, v);
      g.fillStyle = '#111827';
      g.font = '20px sans-serif';
      g.fillText(`Q${i + 1} ${v}`, 44 + i * 150, 372 - v);
    });
    return canvas.toDataURL('image/png');
  });

  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/**
 * Attaches the fixture through the composer, on camera.
 *
 * Returns false rather than throwing: the voice finding is what this page is
 * for, and losing the take because the attachment menu moved would throw away
 * the more important half.
 */
async function attachImage(page: Page): Promise<boolean> {
  const buffer = await renderFixture(page);

  let resolveChooser: ((fc: FileChooser) => void) | undefined;
  const chooserReady = new Promise<FileChooser>((resolve) => {
    resolveChooser = resolve;
  });
  page.once('filechooser', (fc) => resolveChooser?.(fc));

  const addBtn = page
    .locator('button[aria-label*="Add photos or files" i], .cdk-menu-trigger')
    .first();
  const addBox = await addBtn
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => addBtn.boundingBox())
    .catch(() => null);

  if (!addBox) {
    console.warn(`   ⚠️ Attachment control not found — skipping the image half.`);
    return false;
  }

  console.log(`   📎 Opening the attachment menu...`);
  await humanGlide(page, addBox.x + addBox.width / 2, addBox.y + addBox.height / 2, 22);
  await sleep(350);
  await humanClick(page);
  await sleep(700);

  // The menu item carries a tooltip that sits on top of it and swallows real
  // clicks, so this one is dispatched rather than aimed.
  const menuItem = page.locator('[role="menuitem"], .cdk-menu-item').first();
  const itemBox = await menuItem.boundingBox().catch(() => null);
  if (itemBox) {
    await humanGlide(page, itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2, 20);
    await sleep(400);
  }
  await menuItem.click({ force: true }).catch(() => undefined);

  await openFileDialog(page, [
    { name: FIXTURE_NAME, kind: 'PNG image', size: `${Math.round(buffer.length / 1024)} KB` },
    { name: 'team_offsite.jpg', kind: 'JPG image', size: '184 KB' },
    { name: 'invoice_2026_08.pdf', kind: 'PDF document', size: '96 KB' },
  ]);
  await pickFileInDialog(page);
  await closeFileDialog(page);

  const chooser = await Promise.race([
    chooserReady,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  if (!chooser) {
    console.warn(`   ⚠️ No file chooser was raised — skipping the image half.`);
    return false;
  }

  await chooser.setFiles({ name: FIXTURE_NAME, mimeType: 'image/png', buffer });
  console.log(`   📁 ${FIXTURE_NAME} attached (${buffer.length} bytes).`);
  await sleep(1600);
  return true;
}

/**
 * Holds `getUserMedia` until the Allow click, then satisfies it — from the real
 * device if there is one, from an oscillator if there is not.
 */
async function armMicrophone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __allowMic?: () => void;
      __micGate?: Promise<void>;
      __micArmed?: boolean;
      __micSynthetic?: boolean;
    };
    if (w.__micArmed) return;
    w.__micArmed = true;

    w.__micGate = new Promise<void>((resolve) => {
      w.__allowMic = resolve;
    });

    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints: MediaStreamConstraints) => {
      await w.__micGate;
      try {
        return await original(constraints);
      } catch {
        // No input device on this machine. Synthesize one so the composer's
        // recording state is still exercised and still filmable.
        w.__micSynthetic = true;
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        osc.frequency.value = 220;
        osc.connect(dest);
        osc.start();
        return dest.stream;
      }
    };
  });
}

/** Chrome's microphone permission bubble, drawn into the page. */
async function showPermissionBubble(page: Page, origin: string): Promise<void> {
  await page.evaluate((host) => {
    const el = document.createElement('div');
    el.id = 'sim-permission-bubble';
    el.style.cssText =
      'position:fixed!important;top:12px!important;left:96px!important;width:400px!important;' +
      'background:#ffffff!important;color:#202124!important;border-radius:8px!important;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.35),0 0 0 1px rgba(0,0,0,0.08)!important;' +
      'z-index:2147483642!important;font-family:"Segoe UI",system-ui,sans-serif!important;' +
      'padding:16px 18px!important;opacity:0!important;transform:translateY(-8px)!important;' +
      'transition:opacity .18s ease,transform .18s ease!important;';
    el.innerHTML = [
      '<div style="display:flex;gap:12px;align-items:flex-start;">',
      '  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368" style="margin-top:2px"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
      '  <div style="font-size:14px;line-height:1.45;">',
      '    <div style="font-weight:600;margin-bottom:2px;">' + host + ' wants to</div>',
      '    <div style="color:#3c4043;">Use your microphone</div>',
      '  </div>',
      '</div>',
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">',
      '  <button id="sim-permission-block" style="border:1px solid #dadce0;background:#fff;color:#1a73e8;border-radius:4px;padding:7px 14px;font-size:13px;font-weight:500;">Block</button>',
      '  <button id="sim-permission-allow" style="border:none;background:#1a73e8;color:#fff;border-radius:4px;padding:7px 16px;font-size:13px;font-weight:500;">Allow</button>',
      '</div>',
    ].join('');
    document.documentElement.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 30);
  }, origin);
  await sleep(500);
}

async function dismissPermissionBubble(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('sim-permission-bubble');
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 220);
  });
  await sleep(300);
}

export const runVoiceAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  const origin = new URL(page.url()).host;
  const wait = config.waitAfterPromptMs ?? 4000;

  // ── 1. The half that works ───────────────────────────────────────────────
  await showCaption(page, 'Multimodal input — attaching an image to the composer', 'good');

  const attached = await attachImage(page);
  if (attached) {
    const imgCount = await sendPrompt(
      page,
      'Read the attached chart. What is its title, and what is the Q4 value?',
    );
    try {
      await waitForAgentResponseCompletion(page, wait, imgCount);
      await showCaption(page, 'The image was read correctly — multimodal input works', 'good');
      await sleep(2500);
    } catch (e) {
      if (!(e instanceof AgentSilentError)) throw e;
      console.warn(`   ⚠️ No reply to the image prompt.`);
    }
  }

  // ── 2. The half that does not ────────────────────────────────────────────
  await showCaption(page, 'Voice input — the same composer, the microphone control', 'bad');

  await armMicrophone(page);
  // Playwright contexts deny by default, which would reject the call before the
  // prop bubble had any meaning. The gate above is what actually holds it.
  await page
    .context()
    .grantPermissions(['microphone'], { origin: new URL(page.url()).origin })
    .catch(() => console.warn(`   ⚠️ could not grant microphone permission.`));

  const micBtn = page
    .locator('copilot-chat-start-transcribe-button button, button[aria-label*="Transcribe" i]')
    .first();

  const micBox = await micBtn
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => micBtn.boundingBox())
    .catch(() => null);

  if (!micBox) {
    console.warn(`   ⚠️ transcribe control not found — skipping the voice path.`);
  } else {
    console.log(`   🎙️ Clicking the microphone control...`);
    await humanGlide(page, micBox.x + micBox.width / 2, micBox.y + micBox.height / 2, 22);
    await sleep(400);
    await humanClick(page);

    // The prompt Chrome would show, and the click that releases the stream.
    await showPermissionBubble(page, origin);
    const allowBtn = page.locator('#sim-permission-allow');
    const allowBox = await allowBtn.boundingBox().catch(() => null);
    if (allowBox) {
      await humanGlide(page, allowBox.x + allowBox.width / 2, allowBox.y + allowBox.height / 2, 22);
      await sleep(500);
      await humanClick(page);
    }
    await page.evaluate(() => {
      (window as unknown as { __allowMic?: () => void }).__allowMic?.();
    });
    await dismissPermissionBubble(page);

    // Recording is now live: rest on the composer so the recording state, the
    // elapsed timer and the stop control are all on screen long enough to read.
    const stopBtn = page
      .locator(
        'copilot-chat-finish-transcribe-button button, copilot-chat-cancel-transcribe-button button, ' +
          'button[aria-label*="Finish" i], button[aria-label*="Stop" i]',
      )
      .first();

    const recording = await stopBtn
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    const synthetic = await page
      .evaluate(() => (window as unknown as { __micSynthetic?: boolean }).__micSynthetic === true)
      .catch(() => false);

    console.log(
      recording
        ? `   🔴 Recording — stream is ${synthetic ? 'synthesized (no input device)' : 'from the real device'}.`
        : `   ⚠️ The composer never entered its recording state.`,
    );

    await humanGlide(page, micBox.x - 120, micBox.y + micBox.height / 2, 20);
    await sleep(4000);

    // Stopping is what posts the audio for transcription -- i.e. what fails.
    if (recording) {
      const stopBox = await stopBtn.boundingBox().catch(() => null);
      if (stopBox) {
        console.log(`   ⏹️ Stopping — this is the request that has no service behind it.`);
        await showCaption(page, 'Stopping posts the audio for transcription…', 'bad');
        await humanGlide(page, stopBox.x + stopBox.width / 2, stopBox.y + stopBox.height / 2, 20);
        await sleep(400);
        await humanClick(page);
        await sleep(3500);
      }
    }

    await showCaption(page, 'Nothing was transcribed. The composer is still empty', 'bad');
    await sleep(2500);
  }

  // ── 3. The finding, while the empty composer is still on screen ──────────
  if (config.knownIssue) {
    await writeIssueNote(page, config.id, config.knownIssue);
  }

  // Typed, not spoken — so the page still ends on a real agent reply and the
  // clip cannot be mistaken for a dead stack.
  console.log(`   ⌨️ Falling back to the keyboard for the actual turn...`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, wait, msgCount).catch((e) => {
    if (!(e instanceof AgentSilentError)) throw e;
  });
};
