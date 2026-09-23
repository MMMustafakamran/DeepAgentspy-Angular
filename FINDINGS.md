# Findings — DeepAgentspy-angular

Doc defects and doc-vs-implementation discrepancies found by this harness.
Moved out of `README.md` (Known gaps) on 2026-09-23; numbering is unchanged.

## Known gaps

Verified against a live run on **28 Aug 2026** (`@copilotkit/angular` 0.3.1,
`@copilotkit/runtime` 1.67.1, `deepagents` 0.7.5). The frontend moved to
`@copilotkit/angular` 0.4.0 on **30 Aug 2026**; the gaps below were not
re-verified against it, and none of them is in an area 0.4.0 touched. Each is recorded as a video by
`autorecorder/`, and the text below is generated into `DOCUMENTED_REPORT.md` from
the same `knownIssue` objects the clips put on screen — see *Recording and CI*.

- **A2UI is inert, and silently so.** `/info` reports `a2uiEnabled: true`, but
  supplying `a2ui.catalog` is what registers the `render_a2ui` renderer, and the
  guide's catalog snippet is not self-contained. Asking for a surface returns
  prose with **nothing logged** — no error, no catalog request.
  Note this differs from the React/Python build of the same guide, which fails
  loudly with `Catalog not found: https://a2ui.org/.../basic_catalog.json`.
  Tracked on `/a2ui`.
- **Voice transcription fails; image attachments do not.** The microphone
  renders, asks permission and records, but stopping posts a transcription
  request with no service behind it — `/info` reports
  `audioFileTranscriptionEnabled: false`. An image attached to the same composer
  is read correctly, so only the voice half is affected. Tracked on
  `/voice-multimodal`.
- **`CopilotThreadsDrawer` renders nothing.** Not a locked state, not an empty
  state, not an error — nothing. On the same page the hand-built `injectThreads`
  list works: `GET /api/copilotkit/threads` answers 200 with a thread, which
  renders as "Untitled conversation" because the API returns `name: null`.
  Creating a conversation also does not persist (`threadEndpoints.mutations:
  false`). Tracked on `/threads`.
  *Partly re-checked 23 Sep 2026 at `@copilotkit/runtime` 1.73.3 (declared
  `^1.73.3`) and `@copilotkit/angular` 0.5.2 (declared `^0.5.2`):* with the
  runtime's `CopilotKitIntelligence` client configured, `/info` now reports
  `threadEndpoints: { list, inspect, mutations, realtimeMetadata }` all
  `true`, so the `mutations: false` detail no longer reproduces as stated.
  The drawer rendering nothing and creation not persisting were not re-run in a
  browser at these versions; the finding stands until they are.
- **Memory's availability gate reports the wrong answer.** `app-memory-list`
  renders nothing at all — not the memories, and not the guide's "Memory is not
  available for this runtime." fallback. Since that fallback is the
  `@if (!isAvailable())` branch, the gate is returning **true**, yet no request
  to any memory endpoint is ever issued. Tracked on `/memory`.
- **The guide's new `registerComponent` section runs, and its snippet is wrong
  four ways.** The guide's new first section, “Let the agent display one of your
  components”, teaches display-only generative UI through `registerComponent` —
  no `handler`, nothing on the agent side. The premise holds: `show_incident` is
  declared by the browser, forwarded over AG-UI, and called by the model with
  the deepagents graph untouched. Implemented verbatim at `@copilotkit/angular`
  0.5.1, the published snippet then fails four ways, all reproduced against a
  live agent:
  (1) **Every call produces a second turn nobody asked for.** With no `handler`,
  core writes an empty tool result and the model is always handed another turn.
  What lands there is model-dependent — a false apology contradicting the card
  on `gpt-4o-mini`, filler on stronger models. `followUp: false` removes it, and
  the guide never mentions `followUp`.
  (2) **The loading guard never fires.** It gates on `status === "in-progress"`;
  the observed status while arguments stream is `"executing"`, so the `@else`
  branch runs with empty args and paints a blank card first.
  (3) **The status never reaches `"complete"`.** Sampled once a second for 25
  seconds: `"executing"` throughout. The `registerRenderToolCall` snippet higher
  up the same page gates on `"complete"`, so that documented pattern applied to
  a display-only tool loads forever.
  (4) **The card is not a card.** No CSS, and an inline `<strong>` beside an
  inline `<span>`, so Angular's default `preserveWhitespaces` strips the gap and
  it renders as `INC-4711sev1`.
  Smaller gaps: the registration fence shows no imports, so `registerComponent`
  and `z` are undefined identifiers as published; the section never says it must
  run in an Angular injection context though the API reference requires one; and
  the `description` you pass reaches the model behind a prepended preamble. The
  same page also contradicts itself: the older “Render a tool result” snippet
  imports `{ type AngularToolCall, type ToolRenderer }` and sets no
  `standalone`, the new one imports both as values and sets `standalone: true` —
  which `frontend/AGENTS.md` forbids. Both are kept as published, at
  `frontend/src/app/features/tools/incident-card.component.ts`.
  *Note, not a finding:* `registerComponent` does not exist in 0.4.0, which this
  repo declared until now, and `^0.4.0` can never reach 0.5.x; the quickstart's
  unpinned install gives a new reader 0.5.1, so the frontend moved to `^0.5.1`
  (and `@copilotkit/runtime` to `^1.70.1`) to QA the section at all.
  Confirmed against the installed package on **4 Sep 2026**. Tracked on
  `/frontend-tools-generative-ui`.
  *Re-checked 23 Sep 2026 at `@copilotkit/angular` 0.5.2 (declared `^0.5.2`,
  installed `@copilotkit/core` 1.70.2):* the 0.5.1 → 0.5.2 and core 1.70.1 →
  1.70.2 diffs touch slot rendering and thread/memory endpoint routing, not the
  tool-call status values or the follow-up turn, so (1)–(4) still stand by
  source. Not yet re-run against a live agent at 0.5.2.
- **`getWeather` argument mismatch.** The agent declares
  `getWeather(location: str)`, but the frontend renderer in
  `src/app/features/tools/` is written against `{ city }`. The tool call still
  runs and the agent still answers — the card can just render with an empty
  heading. Aligning the two names fixes it. Not on the QA report, which scores
  this page as passing.

- **Quickstart sends you to an Inspector tab that does not exist.** Since the
  22 Sep 2026 sync, Quickstart (and the byte-identical landing page) says to
  open **Rich Threads** in Inspector; the only change in that sync. The
  Inspector still labels the tab `Threads`: `label: "Threads"` in
  `@copilotkit/web-inspector` 1.70.1 (installed, not declared) and in 1.73.0
  (latest on npm). The React `/deepagents/inspector` page has switched to the
  new name, the `/agno` and `/ms-agent-python` copies have not (checked
  22 Sep 2026). No code here uses the label, so nothing changed.
  *Re-checked 23 Sep 2026, still reproduces for an Angular reader.* Installed
  now: `@copilotkit/web-inspector` **1.70.2** (not declared; exact-pinned by
  `@copilotkit/angular` 0.5.2, declared `^0.5.2`, the latest release). The
  tab there is still `label: "Threads"`. "Rich Threads" does appear in 1.70.x,
  but only as a row in the launcher hover menu over the Inspector button
  (`HUD_THREADS_LABEL = "Rich Threads"`), which opens the Inspector on the
  Threads tab. That is not where the step, coming after two Inspector tabs,
  sends you. web-inspector renamed the tab itself to "Rich Threads" in
  **1.73.1** (published 22 Sep 2026; 1.73.0 still says "Threads"; latest is
  1.73.3), but no `@copilotkit/angular` release can install it: 0.5.2 pins
  1.70.2. The upstream `/angular/ms-agent-python` quickstart adopted
  "Rich Threads" in the 23 Sep 2026 sync.

### Two inconsistencies in this repo, not in CopilotKit

- **`backend/langgraph.json` declares `"python_version": "3.12"`** while
  `pyproject.toml` requires `>=3.13` and `.python-version` pins `3.13`. The field
  only governs containerised builds, so local runs are unaffected — but the three
  should agree. CI installs 3.13.
- **`doc-snapshot/pages/angular__deepagents.md` and
  `…__quickstart.md` are byte-identical.** Either the landing page redirects to
  the quickstart and tracking both is redundant, or one was fetched from the
  wrong URL. Drift is reported against both, so a single upstream edit shows up
  twice.

---
