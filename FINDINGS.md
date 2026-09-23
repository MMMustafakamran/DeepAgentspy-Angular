# Findings — DeepAgentspy-angular

Doc defects / doc-vs-implementation gaps. Moved from `README.md` 2026-09-23; order unchanged.

## Known gaps

Baseline: live run 28 Aug 2026 (`@copilotkit/angular` 0.3.1, `@copilotkit/runtime` 1.67.1, `deepagents` 0.7.5); not re-verified at angular 0.4.0 unless noted. Text is generated into `DOCUMENTED_REPORT.md` from the clips' `knownIssue` objects (`autorecorder/`).

- ❌ **A2UI silently inert** (`/a2ui`). `/info` says `a2uiEnabled: true`, but `render_a2ui` only registers via `a2ui.catalog`, and the guide's catalog snippet isn't self-contained. Surface request → prose, nothing logged. (React/Python build fails loudly: `Catalog not found: https://a2ui.org/.../basic_catalog.json`.)
- ❌ **Voice transcription fails** (`/voice-multimodal`). Mic records; stop posts to no service — `/info`: `audioFileTranscriptionEnabled: false`. Image attachments work.
- ⚠️ **`CopilotThreadsDrawer` renders nothing** (`/threads`). Hand-built `injectThreads` list works (`GET /api/copilotkit/threads` 200; shows "Untitled conversation", API returns `name: null`). Creation doesn't persist (`threadEndpoints.mutations: false`).
  23 Sep, runtime 1.73.3 / angular 0.5.2 (declared `^1.73.3` / `^0.5.2`), with `CopilotKitIntelligence`: all `threadEndpoints` flags `true`, so `mutations: false` no longer reproduces. Drawer + persistence not re-run in browser; stands.
- ❌ **Memory availability gate wrong** (`/memory`). `app-memory-list` renders nothing — neither memories nor "Memory is not available for this runtime." fallback (`@if (!isAvailable())`), so gate returns true, yet no memory endpoint request is made.
- ❌ **`registerComponent` snippet wrong 4 ways** (`/frontend-tools-generative-ui`, section “Let the agent display one of your components”). Premise works (`show_incident` forwarded over AG-UI, graph untouched). Verbatim at angular 0.5.1, live agent:
  1. No `handler` → empty tool result → unrequested second turn (false apology on `gpt-4o-mini`). `followUp: false` fixes; guide never mentions it.
  2. Loading guard checks `status === "in-progress"`; actual is `"executing"` → blank card first.
  3. Status never reaches `"complete"` (25 s sampled); the page's `registerRenderToolCall` pattern gating on `"complete"` loads forever.
  4. No CSS; inline `<strong>`+`<span>` + `preserveWhitespaces` → `INC-4711sev1`.

  Also: no imports (`registerComponent`, `z` undefined); injection-context requirement unstated; `description` gets a prepended preamble. Page contradicts itself: “Render a tool result” uses `type` imports, no `standalone`; new one value-imports + `standalone: true` (forbidden by `frontend/AGENTS.md`). Kept as published in `frontend/src/app/features/tools/incident-card.component.ts`.
  Note: absent in 0.4.0 (`^0.4.0` can't reach 0.5.x); repo moved to angular `^0.5.1`, runtime `^1.70.1`. Confirmed 4 Sep 2026.
  23 Sep, angular 0.5.2 (declared `^0.5.2`), core 1.70.2 installed: diffs don't touch status values/follow-up; (1)–(4) stand by source, not live re-run.
- ❌ **`getWeather` arg mismatch.** Agent: `getWeather(location: str)`; renderer in `src/app/features/tools/` expects `{ city }` → empty card heading. Not in QA report (page scored passing).
- ❌ **Quickstart points to nonexistent "Rich Threads" Inspector tab.** Added in 22 Sep 2026 sync (Quickstart + identical landing page). Tab is `label: "Threads"` in `@copilotkit/web-inspector` 1.70.1 and 1.73.0. React `/deepagents/inspector` renamed; `/agno`, `/ms-agent-python` not (22 Sep).
  23 Sep: installed web-inspector 1.70.2 (undeclared; exact-pinned by angular 0.5.2, declared `^0.5.2`, latest) — tab still `"Threads"`; "Rich Threads" only in launcher hover menu (`HUD_THREADS_LABEL`). Tab renamed in web-inspector 1.73.1 (22 Sep; latest 1.73.3), unreachable from angular 0.5.2. Upstream `/angular/ms-agent-python` quickstart adopted "Rich Threads" 23 Sep.

### Repo inconsistencies (not CopilotKit)

- ❌ `backend/langgraph.json` `"python_version": "3.12"` vs `pyproject.toml` `>=3.13` and `.python-version` `3.13`. Containerised builds only; CI uses 3.13.
- ❌ `doc-snapshot/pages/angular__deepagents.md` and `…__quickstart.md` byte-identical → redirect (redundant tracking) or wrong fetch URL; drift reported twice.
