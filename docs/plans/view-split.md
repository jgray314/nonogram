# Plan: split the view files and enforce the storage rule

Goal: make `src/views/create.js` (922 lines) and `src/views/play.js` (778 lines) smaller and easier to change, and enforce the "only `store.js` touches localStorage" contract with a lint rule. Behavior must not change (AGENTS rule 9).

Independent of the end-to-end checks plan (`e2e-pipeline-checks.md`). The existing safety net is `create.test.js`, `game.test.js`, `play-state.test.js`, the 45 UX checks, lint and typecheck; all must pass after every move.

## Decision: pure move

Both views are one `mount()` closure over shared mutable state (create: `st`, `image`, `history`, `savedSig`, the solver client and timers). Functions move to new modules and receive a small context object (state plus callbacks). State is not redesigned or reduced in this plan.

## Target layout

- `src/views/dom.js`: the shared `el()` helper (create.js and play.js each define their own, with different signatures; reconcile to one, or keep two named helpers if the signatures cannot merge).
- `src/views/create/`: `index.js` (mount, state wiring), `image-source.js` (decodeFile, file input, offset, threshold), `preview.js` (rendering, grid view, scale), `report.js` (live solver report, current lines about 364 to 720), `save.js` (draft, save, okToDiscard).
- `src/views/play/`: cut decided by Step 0's map; likely `index.js`, `hud.js` (hearts, timer, rules), `input.js` (strokes), `clues.js`, `finish.js` (solve and reveal).
- `eslint.config.js`: `no-restricted-globals` for `localStorage` and `sessionStorage`, plus `no-restricted-properties` for `globalThis.localStorage` (which `store.js` uses as a default argument), on `src/**`, with an override for `src/store.js`. Grep shows no violations today.

## Steps and parallelism

**Wave 0: three independent lanes, run at the same time (disjoint files).**

- 0a. Storage lint rule (`eslint.config.js` only). Prove it with a probe file that must fail, then delete the probe.
- 0b. Read-only maps of both closures: for each view, list every inner function, the state it reads and writes, and the proposed module. Output is a doc in `docs/plans/`, no code. Two maps can be two lanes (create, play).
- 0c. `views/dom.js` extraction, touching only the `el` definitions and their import lines.

0b feeds Wave 1; 0a and 0c have no dependency on it. 0c must merge before Wave 2 so the extraction lanes do not collide on `el`.

**Wave 1: context contract per view, two lanes (create, play), at the same time.**

Each lane turns its map into the context object shape and makes the view's `index.js` skeleton: `mount()` builds the state and context, and calls into modules that are still empty stubs re-exporting the old inner functions. The tests stay green because nothing has moved yet. This is the step that must be sequential within a view and cannot be skipped: it fixes the interface the Wave 2 lanes code against.

**Wave 2: extraction lanes, in parallel.**

Per view, one lane per module (create: image-source, preview, report, save; play: per the map). They run at the same time only where their source regions do not overlap, which is why the map must list line ranges. Every lane deletes its functions from the old file and nothing else; adjacent-region deletions merge cleanly, and overlapping ones go to the same lane. Cap at about three live lanes per view: the merge cost beyond that outweighs the speedup. If two modules share a helper, it goes to the earlier merged one.

Create and play lanes never touch each other's files, so the create group and the play group run in parallel with one another as well.

**Wave 3: sequential.** After each merge: `npm test && npm run lint && npm run format:check && npm run typecheck` and `npm run test:ux`. The orchestrator drives the manual checks in the browser pane (Create with a photo, play a puzzle on a narrow and wide width), one at a time, since the pane is shared.

Feature rows: one per view split (`split-create-view`, `split-play-view`) and one for the lint rule (`storage-lint-rule`). The verify command for a split is the full check plus `npm run test:ux`.

## Open item for Step 0b

Whether `play.js` splits cleanly depends on how much of its 680-line closure is shared state. If the map shows more than a few module-crossing writes, narrow that view's split rather than force it, and note what was left out.

## Gate

The maintainer wants one gate check on the whole round once every lane of both plans is done, before anything is pushed to `main` on GitHub. Nothing in this plan pushes. Lanes merge to local `main` only.
