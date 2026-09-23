# Findings — DeepAgentspy-angular
Current open doc defects only. A finding is added here only after a human reviews and approves it; page failures in a run are never written here automatically. Resolved or superseded findings are removed (see git history).
Stack: `@copilotkit/angular` 0.5.2 (declared `^0.5.2`), `@copilotkit/runtime` 1.73.3 (declared `^1.73.3`), `@copilotkit/web-inspector` 1.70.2 (via angular), `deepagents` 0.7.5.

## Quickstart — [/angular/deepagents/quickstart](https://docs.copilotkit.ai/angular/deepagents/quickstart)

- **#7 ❌ Points to an Inspector tab called "Rich Threads" that does not exist.** The landing page has the same text. The tab is `label: "Threads"` in web-inspector 1.70.2 (pinned by angular 0.5.2). "Rich Threads" is only the launcher hover label (`HUD_THREADS_LABEL`). The rename landed in web-inspector 1.73.1, which angular 0.5.2 can't reach.

## A2UI — [/angular/deepagents/a2ui](https://docs.copilotkit.ai/angular/deepagents/a2ui)

- **#1 ❌ A2UI does nothing and reports no error.** `/info` says `a2uiEnabled: true`, but `render_a2ui` only registers via `a2ui.catalog`, and the guide's catalog snippet isn't self-contained. A surface request returns prose and nothing is logged.

## Voice & multimodal — [/angular/deepagents/voice-multimodal](https://docs.copilotkit.ai/angular/deepagents/voice-multimodal)

- **#2 ❌ Voice transcription fails.** The mic records, but stopping posts to no service. `/info`: `audioFileTranscriptionEnabled: false`. Image attachments work.

## Threads — [/angular/deepagents/threads](https://docs.copilotkit.ai/angular/deepagents/threads)

- **#3 ⚠️ `CopilotThreadsDrawer` renders nothing.** A hand-built `injectThreads` list works (`GET /api/copilotkit/threads` 200; the API returns `name: null`, shown as "Untitled conversation").

## Memory — [/angular/deepagents/memory](https://docs.copilotkit.ai/angular/deepagents/memory)

- **#4 ❌ Memory availability check is wrong.** `app-memory-list` shows neither memories nor the "Memory is not available for this runtime." fallback (`@if (!isAvailable())`). So the check returns true, yet no request goes to a memory endpoint.

## Frontend tools & generative UI — [/angular/deepagents/frontend-tools-generative-ui](https://docs.copilotkit.ai/angular/deepagents/frontend-tools-generative-ui)

- **#5 ❌ `registerComponent` snippet is wrong in 4 ways** (section "Let the agent display one of your components"). The basic approach works (`show_incident` is forwarded over AG-UI).
  1. No `handler`, so the tool result is empty and the agent takes a second turn nobody asked for. `followUp: false` fixes it; the guide never mentions it.
  2. The loading check tests `status === "in-progress"`, but the actual value is `"executing"`, so the card is blank at first.
  3. Status never reaches `"complete"`, so the page's `registerRenderToolCall` pattern that waits for `"complete"` stays loading forever.
  4. No CSS. Inline `<strong>`+`<span>` with `preserveWhitespaces` renders as `INC-4711sev1`.

  Also: the snippet has no imports (`registerComponent` and `z` are undefined). It doesn't say it must run in an injection context. `description` gets a preamble added to the front. The page contradicts itself: "Render a tool result" uses `type` imports and no `standalone`, while the new section uses value imports and `standalone: true`. Verbatim copy: `frontend/src/app/features/tools/incident-card.component.ts`.

---
NOT WRITTEN: Write was blocked by the harness ("subagents should return findings as text"), so C:\Users\QS\Desktop\Fiqros\DeepAgentspy-angular\FINDINGS.md is unchanged.

Numbering: the old file had no numbers on its findings. The IDs above are my assumption, counting bullets in file order: 1 A2UI, 2 Voice, 3 Drawer, 4 Memory, 5 registerComponent, 6 getWeather, 7 Rich Threads, 8 langgraph python_version, 9 doc-snapshot duplicate. A search of the repo for "FINDINGS.md #N" came back empty, so no code depends on these numbers yet.

Kept: 1, 2, 3 (open part only), 4, 5, 7.

Removed:
- 3 (part): the `threadEndpoints.mutations: false` problem no longer reproduces at runtime 1.73.3.
- 6: the `getWeather` argument mismatch is a bug in this repo's own code (agent vs renderer), not a doc bug.
- 8, 9: listed under "Repo inconsistencies (not CopilotKit)".

The doc links for A2UI, voice, threads, memory and frontend tools are my guesses, built from the short paths the old file gave (for example `/a2ui`) plus the https://docs.copilotkit.ai/angular/deepagents base.
