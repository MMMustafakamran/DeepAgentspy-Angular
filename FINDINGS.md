# Findings — DeepAgentspy-angular
Current open doc defects only. A finding is added here only after a human reviews and approves it; page failures in a run are never written here automatically. Resolved or superseded findings are removed (see git history).
Stack: `@copilotkit/angular` 0.5.2 (declared `^0.5.2`), `@copilotkit/runtime` 1.73.3 (declared `^1.73.3`), `@copilotkit/web-inspector` 1.70.2 (via angular), `deepagents` 0.7.5.
Major = blocks a reader (doesn't compile, crashes/throws, silently broken behaviour, step impossible to follow, missing required step/package, 404 target). Minor = one-line notes.

## Major

### A2UI — [/angular/deepagents/a2ui](https://docs.copilotkit.ai/angular/deepagents/a2ui)

- **#1 A2UI does nothing and reports no error.** `/info` says `a2uiEnabled: true`, but `render_a2ui` only registers through `a2ui.catalog`, and the guide's catalog snippet doesn't work on its own. A surface request returns plain text and nothing is logged.

### Voice & multimodal — [/angular/deepagents/voice-multimodal](https://docs.copilotkit.ai/angular/deepagents/voice-multimodal)

- **#2 Voice transcription fails.** The mic records, but stopping it sends the audio to no service. `/info` shows `audioFileTranscriptionEnabled: false`. Image attachments work.

### Threads — [/angular/deepagents/threads](https://docs.copilotkit.ai/angular/deepagents/threads)

- **#3 `CopilotThreadsDrawer` renders nothing.** A list built by hand with `injectThreads` works (`GET /api/copilotkit/threads` returns 200).

### Memory — [/angular/deepagents/memory](https://docs.copilotkit.ai/angular/deepagents/memory)

- **#4 Memory availability check is wrong.** `app-memory-list` shows neither memories nor the `@if (!isAvailable())` fallback. The check returns true, but no request ever reaches a memory endpoint.

### Frontend tools & generative UI — [/angular/deepagents/frontend-tools-generative-ui](https://docs.copilotkit.ai/angular/deepagents/frontend-tools-generative-ui)

- **#5 `registerComponent` snippet is broken** (section "Let the agent display one of your components"). The snippet has no imports, so `registerComponent` and `z` are undefined, and the page doesn't say it must run in an injection context. With no `handler`, the tool result is empty and the agent takes an extra turn nobody asked for (`followUp: false` fixes it, but the page doesn't mention it). The loading check tests `"in-progress"`, but the actual value is `"executing"`. Status never reaches `"complete"`, so the page's `registerRenderToolCall` pattern stays loading forever. Verbatim copy: `frontend/src/app/features/tools/incident-card.component.ts`.

## Minor notes

- #7 [Quickstart](https://docs.copilotkit.ai/angular/deepagents/quickstart): the page (and the landing page) says Inspector tab "Rich Threads". In web-inspector 1.70.2 it is `label: "Threads"`, and "Rich Threads" is only the hover label (`HUD_THREADS_LABEL`). The rename came in 1.73.1, which angular 0.5.2 can't reach.
- #3 Threads: the API returns `name: null`, which shows as "Untitled conversation".
- #5 Frontend tools: the snippet has no CSS, so inline `<strong>`+`<span>` with `preserveWhitespaces` renders as `INC-4711sev1`. A preamble is added to the front of `description`. The page is inconsistent: "Render a tool result" uses `type` imports without `standalone`, while the new section uses value imports and `standalone: true`.
