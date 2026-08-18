# Doc drift changelog

What the CopilotKit docs changed under this repo, written by the sync on
`/doc-sync`. Only pages that actually moved are recorded — a sync that finds
everything unchanged writes nothing here at all.

Holds the 3 most recent dated entries. When a change lands on a fourth
date, the oldest entry is dropped. Entries are counted, not aged, so a gap of
weeks between changes does not expire anything.

## 2026-08-18

### 06:47 UTC — 2 pages, highest severity high

**High — Human-in-the-loop and interrupts** · _local snapshot edit, not an upstream change_

`/angular/deepagents/guides/human-in-the-loop` · route `/human-in-the-loop` · under “Register a decision tool”

4 code lines, 3 prose lines changed.

````diff
+ The renderer receives a `toolCall` signal. Call `respond(result)` once the user
+ has made a choice.
+ 
+ type ApprovalArgs = {
+ action: string;
+ reason: string;
+ };
````

**High — Voice and multimodal input** · _local snapshot edit, not an upstream change_

`/angular/deepagents/guides/voice-multimodal` · route `/voice-multimodal` · under “Accept voice input” · in a `typescript` block

2 code lines changed.

````diff
- 
+ component:
````
