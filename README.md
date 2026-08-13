# CopilotKit + DeepAgents — Angular

A navigable test harness for the Angular section of the CopilotKit DeepAgents documentation. Each guide in the sidebar is a route that runs the thing its doc page teaches, rather than restating it.

Tracks **<https://docs.copilotkit.ai/angular/deepagents>**.

| | |
|---|---|
| **Frontend** | Angular 22.1.1 · TypeScript 6.0 · Tailwind 4 · zoneless |
| **CopilotKit** | `@copilotkit/angular` 0.3.1 · `@copilotkit/runtime` 1.67.1 |
| **AG-UI** | `@ag-ui/langgraph` 0.0.42 |
| **Backend** | Python 3.13 · `deepagents` 0.7.5 · `copilotkit` 0.1.94 |
| **Model** | `openai:gpt-4o` |

---

## Architecture

Three processes, not two. Angular has no server route to host the Copilot Runtime, so the runtime is its own Node process sitting between the browser and the agent.

```
Browser (Angular 22, zoneless)  ·  localhost:4200
  │  @copilotkit/angular — provideCopilotKit, <copilot-chat>, signal APIs
  │  POST http://localhost:8200/api/copilotkit
  ▼
Copilot Runtime  ·  localhost:8200          ← Node, frontend/server.ts
  │  agents: { default, support } → new LangGraphAgent({ deploymentUrl, graphId })
  │  a2ui: {}  → A2UIMiddleware
  │  http://localhost:8123 · graph "sample_agent"
  ▼
DeepAgents agent  ·  localhost:8123         ← Python, backend/main.py
  │  create_deep_agent(middleware=[CopilotKitMiddleware()])
  ▼
OpenAI  (gpt-4o)
```

The backend is a **graph, not an HTTP server**. `backend/main.py` exports `agent = create_deep_agent(...)`, and `backend/langgraph.json` publishes it under the graph id `sample_agent`. Serving it is the dev server's job — which is why the runtime binds it with `LangGraphAgent` by `deploymentUrl` + `graphId` rather than by a plain URL.

**Why two agent ids.** `default` and `support` both resolve to the same graph. `default` is what CopilotKit's prebuilt components use with no configuration; `support` exists so the Chat UI and Threads guide snippets — written as `agentId="support"` — run exactly as published.

**The model key never reaches the browser**, and never reaches the runtime either. Only the Python process holds it.

---

## Prerequisites

| Requirement | Version used here | Notes |
|---|---|---|
| Node.js | 24.16.0 | Angular 22 requires `^22.22.3 \|\| ^24.15.0 \|\| >=26` |
| npm | 12.0.1 | |
| Python | 3.13 | pinned in `backend/.python-version` |
| [uv](https://docs.astral.sh/uv/) | 0.11+ | manages the Python env and the dev server |
| OpenAI API key | — | the agent runs `openai:gpt-4o` |

---

## Setup

### 1. Backend

```bash
cd backend
uv sync
```

Create `backend/.env` with your key — `langgraph.json` declares `"env": ".env"`, so the dev server loads it automatically:

```bash
echo "OPENAI_API_KEY=sk-..." > .env
```

### 2. Frontend

```bash
cd frontend
npm install
```

---

## Run

Two terminals. Start the backend first — the runtime resolves the graph on its first request, so order is not strictly enforced, but the chat will not stream until both are up.

**Terminal 1 — the DeepAgents agent, on :8123**

```bash
cd backend
uv run --with "langgraph-cli[inmem]" langgraph dev --port 8123 --no-browser
```

Wait for `🚀 API: http://127.0.0.1:8123`. The `--with` flag pulls in the dev server without adding it to the project's dependencies.

**Terminal 2 — the Copilot Runtime (:8200) and Angular (:4200)**

```bash
cd frontend
npm run dev
```

`npm run dev` runs both under `concurrently`. To run them separately instead:

```bash
npm run runtime   # Copilot Runtime on :8200
npm start         # Angular dev server on :4200
```

Then open **<http://localhost:4200/>**. The Introduction route has a live connection check for both backend processes.

---

## Verify it works

1. **The agent is up** — `curl -i http://localhost:8123/ok` answers 200.
2. **The graph is registered** — this should return one assistant with `"graph_id":"sample_agent"`:
   ```bash
   curl -X POST http://localhost:8123/assistants/search \
     -H 'content-type: application/json' -d '{"graph_id":"sample_agent"}'
   ```
3. **The runtime sees both agents** — `curl http://localhost:8200/api/copilotkit/info` lists `default` and `support`. This is the one check the quickstart's troubleshooting box prescribes.
4. **End to end** — open `/quickstart` and send *Can you tell me a joke?* Tokens should stream in one at a time and render as markdown.

---

## Ports and environment variables

| Port | Process | Started by |
|---|---|---|
| 4200 | Angular dev server | `npm start` |
| 8200 | Copilot Runtime | `npm run runtime` |
| 8123 | DeepAgents agent | `langgraph dev --port 8123` |

| Variable | Read by | Default |
|---|---|---|
| `OPENAI_API_KEY` | `backend/.env` → the agent | — (required) |
| `DEEPAGENTS_DEPLOYMENT_URL` | `frontend/server.ts` | `http://localhost:8123` |
| `DEEPAGENTS_GRAPH_ID` | `frontend/server.ts` | `sample_agent` |
| `PORT` | `frontend/server.ts` | `8200` |

Change the agent's port in both places or the runtime will not find it.

---

## Project layout

```
backend/
  main.py           create_deep_agent(...) → `agent`, plus the getWeather tool
  langgraph.json    publishes ./main.py:agent as the graph "sample_agent"
frontend/
  server.ts         Copilot Runtime — the one file that ties CopilotKit to DeepAgents
  src/app/app.config.ts   provideCopilotKit at the application root
  src/app/features/       one folder per guide; the code the routes display and run
  src/app/pages/          the doc routes themselves
  src/app/lib/nav-config.ts   routes, doc links, and per-route status
  scripts/generate-sources.ts prestart/prebuild step that snapshots source for display
```

Routes render their own source off disk, so what a page shows is byte-identical to what runs. `npm start` and `npm run build` regenerate that snapshot automatically; run `npm run gen:sources` by hand if you edit a feature file while the dev server is up.

---

## Troubleshooting

**Nothing streams in the chat.** One of the two backend processes is down. The Introduction route probes both and shows which.

**`EADDRINUSE` on 8200.** Another Copilot Runtime is already listening. Stop it, or start this one on a different port with `PORT=8201 npm run runtime` — and update `runtimeUrl` in `src/app/app.config.ts` to match.

**`Failed to create thread: Invalid thread ID: must be a UUID`.** Only appears when calling the runtime directly with a hand-written thread id. The chat components generate UUIDs themselves.

**Threads and memory routes render a locked or empty state.** Expected. Those endpoints come from the CopilotKit Enterprise Intelligence Platform; without a license key there is nothing to list. See the per-route status notes.

**Microphone records but transcription fails.** Expected. This runtime has no transcription service configured.

---

## Known gaps

- **`getWeather` argument mismatch.** The agent declares `getWeather(location: str)`, but the frontend renderer in `src/app/features/tools/` is written against `{ city }`. The tool call still runs and the agent still answers — you just get plain text where the weather card should be. Aligning the two names fixes it.
- **A2UI is inert.** `/info` reports `a2uiEnabled: true`, but supplying `a2ui.catalog` is what actually registers the `render_a2ui` renderer, and the guide's catalog snippet is not self-contained. Tracked on the `/a2ui` route.
