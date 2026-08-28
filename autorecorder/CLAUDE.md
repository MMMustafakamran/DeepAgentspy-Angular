# Working in `autorecorder/`

**Before editing anything here, read [ADAPT.md](ADAPT.md).**

This folder is a portable screen-recording suite shared across every CopilotKit
framework repo adapted per framework.

Two rules override any instinct to tidy:

1. **`core/` is frozen.** It holds no framework-specific values — they all come
   from `config/`. If a port seems to need a `core/` change, report it instead of
   making it: it means something leaked into shared code and every other repo has
   the same bug.

2. **`npm run doctor` is the definition of done.** Not "the config looks right".
   The command exits 0, or the adaptation is not finished. Say which check fails
   rather than describing the work as complete.

The adaptation surface is exactly: `config/project.config.ts`,
`config/pages.config.ts`, `config/selectors.config.ts`, and `actions/`.

When a change here is worth keeping across repos, it belongs in `core/` and
should be ported to the other copies — say so explicitly so it can be.

## What this copy added to `core/`, and owes the others

This repo tracks defects as well as features, which the reference suite had no
way to express: a broken page could only report `[FAIL]`, and five of those
every night is a pipeline nobody reads. Four additions came out of that, none of
them framework-specific, all of them **owed to the sibling repos**:

- `types.ts` — `KnownIssue`, and `knownIssue` on `PageDefinition`
- `engine.ts` / `cli.ts` — the `[ISSUE]` outcome, which records and exits 0
- `issue-note.ts` — the defect report, typed on screen from that same object
- `overlays/caption.ts`, `overlays/devtools-console.ts`, `compare.ts` — the three
  ways of making an absence visible on video

`ADAPT.md` Step 5b documents the contract. If you are reading this while porting
somewhere else, these are already yours to use.
