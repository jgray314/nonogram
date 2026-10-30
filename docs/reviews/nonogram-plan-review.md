# Nonogram Studio: plan reviews

## Plan review: Nonogram Studio v1, 2026-10-08

**Scope:** top-level plan, reviewed against `tools/nonogram/PLAN.md` (D1 to D5 closed).
**Note:** this isn't an AI-feature or showcase project. Checks 1, 4 and 8 (eval sizing, personal-data mitigations, signature-signal coverage) were applied by analogy.

**Findings:**
- **#2, Steps 3 and 4.** The one hard "never" property is *never call an ambiguous puzzle fair*. The plan relied only on hand-picked fixtures. **Fixed.**
  - Added an exhaustive 4x4 cross-check: all 65,536 grids, with the true solution count from grouping grids by clue signature.
  - Added `capped search reports unknown, never unique`.
- **#7, Step 3.** "Per-line deduction" was underspecified. Simple overlap and a complete line solver give different "line-solvable" verdicts. **Fixed:** the solver is now specified as complete, with all placements found by DP.
- **#7, Step 4 vs Risks.** The Risks section introduced an `unknown` result that step 4's list of results didn't include. **Fixed:** `unknown` is in the list and is never shown as fair.
- **#7, "My calls", difficulty label.** "Few" and "many" sweeps weren't defined. **Fixed:** a sweep is defined, provisional thresholds are set (3 or fewer is Easy), and calibration happens in step 13.
- **#7, Step 5 and D2.** The hash scope and the encoding of saved cells weren't defined. **Fixed:**
  - The id is SHA-256 over width, height, palette and solution, truncated to 16 hex characters, with the title excluded.
  - Saved cells use `0` / `-1` / `k`.
- **#7, Step 6.** Stroke rules for a right-click on a filled cell, and for fill strokes crossing X'd cells, weren't specified. The step was also oversized. **Fixed:** split into 6a (shell, render, hash routes) and 6b (a full stroke rule table).
- **#7, Step 11.** Oversized. **Fixed:** split into 11a (editor) and 11b (live report).
- **#4 by analogy, Step 12.** Source photos are personal data, and the plan didn't say whether they're stored. **Fixed, structurally:** the image is never stored, and the test `library record has no image data` enforces it.
- **#7, Scope and step 10. Open, needs the owner.** Grid shape (square only, or independent width and height) and image aspect handling aren't specified. Two implementers would diverge. Logged as Q6 in the plan. Blocks step 10 only.

**Clean checks:**
- #1: no evals, since nothing in the pipeline is non-deterministic.
- #3: tooling is in step 0.
- #5: no parallel slices.
- #6: D1 to D5 each have reasoning and rejected alternatives.
- #8: N/A as written (it targets showcase projects). The project's own core feature, the fairness report, is in v1 (steps 3, 4 and 11b), not deferred.

**Verdict:** Ready to execute steps 0 to 9. Q6 must close before step 10.

## Plan review, delta pass: tiling (Q7), 2026-10-08

**Scope:** steps 12b to 12d only, added after pass 1.

**Findings:**
- **#7, Step 12b and D2. Fixed.** A content-only id hash would make two identical tiles (for example two blank areas) collide and share save state. The set position is now part of the hash, and the test `identical tiles get distinct ids` covers it.
- **#7, Step 12c. Fixed.** All-blank and all-filled tiles are degenerate puzzles. The creator now flags them.

**Verdict:** Ready to execute all steps. Blocked only on the Node install.

## Plan review, pass 2: full plan after parallel lanes, branching and tiling, 2026-10-08

**Scope:** the whole `PLAN.md`, read cold. Extra weight on check #5, since parallel-slice claims are new since pass 1.

**Findings (all fixed in the plan):**
1. **#5, lane table: no owner for storage keys.** Lane P (`save.js`) and lane L (`library.js`) would each have designed their own `localStorage` layout, and lane K needed L's save API without depending on it. **Fixed:**
   - A new `store.js` contract (keys, plus `get`, `put`, `list` and `remove`) is built in the W2 gate.
   - P and L both go through it.
   - `src/library.js` was dropped from L.
2. **#5, steps 5 and 12b: contract contradiction.** Step 5's id hash excluded `set`. Step 12b required it, so lane B would have had to edit `format.js`, which lane C owns. **Fixed:** the hash covers `set` in step 5's contract, and the test `id includes set position` was added there.
3. **#5, D2 save record and 12d: missing field.** The set mosaic counts solved tiles, but the save record had no solved field. That dependency would have been invented mid-lane. **Fixed:** `solvedAt` added to the save record, and step 7 sets it.
4. **#5, Branching: the worktree method wouldn't work.** The Agent tool's built-in worktree isolation branches the session's repo, and the session's working folder isn't a git repo. **Fixed:** worktrees are made by hand with `git worktree add`, with one `npm ci` per worktree.
5. **#7, step 6b: the stroke rules contradicted themselves.** "Left on crossed fills" clashed with "a fill stroke skips crossed cells". **Fixed:**
   - A full table: button by first cell, giving the action and which cells it changes.
   - Crosses are protected from left strokes. One stroke is one undo step.
   - Overridable call, logged.
6. **#7, steps 7 and 9: "solved" was undefined for puzzles that aren't unique.** It could mean matching the stored solution or satisfying every clue. Check and hint assume the stored solution. **Fixed:**
   - Solved means every clue is satisfied.
   - Check and hint are disabled on puzzles that aren't unique.
   - Saving an unfair puzzle is allowed, with a badge.
   - Overridable calls, logged.
7. **#7, step 11b: "ambiguous cells" could mean two things.** Line-solver-unresolved cells and cells that differ between two solutions are different sets. **Fixed:** the solver returns `differing`. The UI highlights `differing` when the result is `multiple`, and `unresolved` when it's `needs-guessing`.
8. **#2, step 4: the oracle only covered uniqueness.** The 4x4 cross-check validated unique vs multiple, but nothing independently checked line-solvability, and the difficulty labels depend on it. **Fixed:**
   - `brute line oracle agrees on all 4x4`, an independent naive line solver.
   - An optional `test:slow` exhaustive 5x5 run.
9. **#7, step 4 and Risks: wrong performance guard, undefined budget.** The guard was at 20x20 while 25x25 is in scope. The budget wasn't defined (time-based would make tests flaky). The solver on the main thread would freeze the editor, and 12c solves up to 16 tiles. **Fixed:**
   - The guard is now at 25x25.
   - The budget is a node count.
   - A Web Worker wrapper was added to lane A.
   - 11b and 12c go through the worker.
10. **Sizing: two steps were oversized.** **Fixed:** step 4 split into 4a (search) and 4b (verification and worker). Step 12 split into 12 (library) and 12p (print).
11. **#7, Strokes contract: no color slot.** It had no slot for which color to paint, so color mode would break a frozen contract. **Fixed:** an optional `paint = 1` parameter.

**Clean checks:**
- #1 n/a (no evals).
- #3 tooling is in step 0, and the lint gate is on every merge.
- #4 the image is still never stored, and the store contract doesn't change that.
- #6 every decision, including the pass-2 calls, has reasoning and the alternatives it rejected.
- #8 the fairness report (4a, 4b, 11b) is still in v1 and gained the oracle.

**Not changed, flagged:**
- The local serve config is listed in step 0's owned files, but it lives outside the repo. Harmless.
- D3 has no rejected alternative written down. Trivial.

**Verdict:** Ready to execute. Blocked only on the Node install.

## Plan review, pass 3: execution mechanics, 2026-10-08

**Scope:** the whole `PLAN.md`, read cold. Node v24.20.0 confirmed installed, and git identity confirmed (owner's name, noreply email). Pass 2 covered the specs. This pass focuses on what breaks once 4 subagents actually start.

**Findings (all fixed in the plan):**
1. **#5, step 0 and lane A: shared-file conflict.** Lane A needs a `test:slow` script in `package.json`, which step 0 owns. Any lane adding a script would create merge conflicts. **Fixed:** step 0 defines every script up front (`test`, `test:slow`, `lint`, `format:check`), and lanes never edit `package.json`. The test file convention is `test/<module>.test.js`.
2. **Structural, not habitual, Branching: co-author trailer.** "No AI co-author trailer" was a rule, but subagents receive the default attribution instruction, and this exact failure has already recurred twice in another of the owner's repos. **Fixed:**
   - A `commit-msg` hook rejects the trailer. It's shared by every worktree.
   - Commits use a repo-local identity for the owner.
3. **#5, [manual] steps under parallel lanes: one browser pane.** There's one pane. W3's three UI lanes each have [manual] checks, so parallel agents would collide in it. **Fixed:** lanes only run Node tests, and the orchestrator does manual checks one at a time on merged `main`.
4. **Owner's working-rules carry-over: no runaway rule for lanes.** The two-failures-then-stop rule and the check-in cadence weren't carried into the lanes. A stuck subagent would loop unseen. **Fixed:**
   - The Lane rules block goes into every lane prompt: stop after 2 failures, never edit contracts, paste real test output.
   - Check-ins happen at each merge and each wave boundary.
5. **#7, step 4b: untestable unit claimed as tested.** The worker wrapper sat under a "Tests:" list but can't run in `node --test`. **Fixed:** it's marked as a thin shell, checked [manual] in 11b.
6. **#7, step 0: launch.json location.** Pass 2 flagged the location but didn't fix it. **Fixed:** the entry is in the serve config outside the repo, using `--directory`.

**Verified, no change:**
- `crypto.subtle` is global in Node 24 and available in the browser on localhost (a secure context). The id hash contract holds in both places.
- Canvas `getImageData` on a user-uploaded file isn't tainted, so `image.js` input works.
- Module workers (`type: 'module'`) are supported in desktop Chrome and Edge, which is the target from D4.

**Clean checks:**
- #1 n/a.
- #3 tooling, now including the hook, is in step 0.
- #4 unchanged.
- #6 the new calls are logged with reasons.
- #8 the fairness report is intact.

**Diminishing returns.** Pass 1 found 9 issues, pass 2 found 11, and pass 3 found 6, all about mechanics rather than specs. Another plan-only pass is unlikely to pay. The next real information comes from running W1.

**Verdict:** Ready to execute. Start with step 0.

## Plan review, pass 4: dependency timing and data contracts, 2026-10-08

**Scope:** the whole `PLAN.md`, read cold. This pass traced every "Depends on" entry against what actually exists in each worktree at the moment it's needed.

**Findings (all fixed in the plan):**
1. **#5, step 5 and lane C: the dependency can't be met.** XML export needs `clues.js`. Lane C's worktree branches from `main` before lane A merges, so the file wouldn't exist. "Do it last within the step" didn't solve that. **Fixed:** XML export split into 5x (W2·C, `src/webpbn.js`), after step 1 merges.
2. **#5, Branching: per-lane merging stalls W2.** "Lanes merge when their steps pass" meant lane A merged only after 4b, so the W2 gate (which needs only step 1) would wait on the whole solver. **Fixed:** merges happen per step. A lane that needs another lane's step runs `git merge main` first.
3. **#5 and #7, D2 and step 9: contract gap.** "Check disabled when not unique" and the library's "not fair" badge both need a fairness result, but the puzzle record had no field for it. The player lane would either re-solve on load (slow at 25x25, and it doesn't depend on the solver) or invent a field. **Fixed:** a `verdict` is cached on the puzzle when it's saved, and excluded from the hash. `v: 1` is pinned.
4. **#7, steps 11 and 12: nobody owned saving.** The save button lives in the creator (lane K), but step 12 put "save" in the library lane (L). **Fixed:** new step 11c makes the creator own saving, including `save waits for a fresh report`, so a stale verdict can't be saved. The library only lists, plays, deletes and backs up.
5. **#7 and data loss, steps 8 and 12: the only store has no backup.** `localStorage` is the only store, and clearing browser data wipes everything. The save file export also didn't include the puzzle, so it couldn't restore on a fresh browser. **Fixed:**
   - `backup.js` handles full-library export and import.
   - The save export bundles its puzzle.
   - `import adds missing puzzle` is tested.
6. **#7, step 12b: the threshold method was undefined.** Two implementers would diverge between one threshold per tile and one global threshold, and per-tile thresholds leave visible seams in the finished mosaic. **Fixed:** one global threshold over the full grid, which is then sliced. The test is now `tiles reassemble to the full grid`.
7. **#2, step 4b: the performance guard could pass trivially.** "25x25 under 1s" didn't name a fixture, and an easy one would pass without testing anything. **Fixed:** two fixtures, including seeded noise that has to hit the budget and return `unknown` within 1s.

**Clean checks:**
- #1 n/a.
- #3 is unchanged.
- #4: backup files contain grids only, never images. This was checked against step 12's no-image test.
- #6: the pass-4 calls are logged.
- #8: the fairness report is intact, and `verdict` makes it persistent.

**Trend:** 9, then 11, then 6, now 7. Pass 4's findings were real: two would have stalled lanes and one would have lost data. They came from a new angle (tracing dependency timing), not from repeating earlier checks. The remaining risk is in things a plan can't show, like solver performance and UI feel.

**Verdict:** Ready to execute. Start with step 0.

## Plan review, pass 5: traceability, 2026-10-08

**Scope:** the whole `PLAN.md`. This pass traced every research finding, decision (D1 to D5, Q6, Q7) and scope line to the step that builds it. It also added the "Limits of plan-only review" section the owner asked for.

**Findings (all fixed in the plan):**
1. **#7, Q6 and step 10: a closed decision with no step building it.** Q6 (width and height picked independently, aspect-based default, draggable crop) was decided, but step 10 still said "size presets". **Fixed:** step 10 now includes the size picker, `defaultSize`, the crop offset and tests.
2. **#7, Research and steps 6 and 7: a convention silently dropped.** The live stroke-length count, listed in Research, wasn't in any step. **Fixed:** added to step 7, with a test.
3. **#7, D4 and step 7: keyboard behavior undefined.** D4 says "mouse and keyboard", but no step defined keyboard behavior. **Fixed:** Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work for undo and redo. Moving a cursor by keyboard is explicitly out of v1.
4. **#7, step 12: difficulty couldn't be shown.** The library couldn't show difficulty because `verdict` stored only the status, and difficulty needs sweeps. **Fixed:** `verdict` is now `{status, sweeps}`, with the test `difficulty label from verdict`.
5. **Process fit, step 4b: the merge gate could get slow.** Two exhaustive 4x4 tests run on every merge, against "fast check" expectations. **Fixed:** a runtime rule. The default `npm test` stays under about 10s, otherwise the exhaustive tests move to `test:slow` and the default suite keeps a seeded 2,000-grid sample.
6. **Risks: the "image conversion" risk had no mitigation that happens before step 10.** **Fixed:** the Limits table asks the owner for 3 to 5 sample images by W3. The UI hint about which images convert well moved into step 10.

**Added at the owner's request:**
- A **Limits of plan-only review** section listing 6 unknowns a plan can't settle, each with its earliest real evidence.
- A **W1r retro checkpoint**, so step estimates, solver performance and subagent behavior get checked before W2 builds on them.

**Clean checks:** every other Research bullet, D1 to D5, Q7 and every scope line traces to a step.

**Verdict:** Ready to execute. Start with step 0.

## Plan review, pass 6: error paths, trust boundaries and consistency after edits, 2026-10-08

**Scope:** the whole `PLAN.md`. New angles: what happens when input is bad (imports, storage, images); where untrusted data enters; and stale cross-references left by five rounds of edits.

**Findings (all fixed in the plan):**
1. **#7 traceability, step 5x and lane table: an orphaned module with a wrong dependency.** No step gave XML export a UI. The module existed but nothing called it. Pass 4 also wired 5x as a dependency of print (12p), which doesn't use it. **Fixed:** an "Export webpbn XML" action in step 12, and the dependency moved from 12p to 12.
2. **#7, step 12c: nobody owned saving a set.** Step 11c covered single puzzles only. **Fixed:** 12c owns "Save set", writing the tiles before the set record. The test `set save writes tiles before set record` means an interrupted save never leaves a set pointing at missing tiles.
3. **Error path, steps 5, 6a, 8 and 12: no input validation.** Imports (save file, backup) and storage reads had no validation. One malformed or future-version record would crash the library on load. **Fixed:**
   - `validatePuzzle`, `validateSave` and `validateSet` in `format.js`. They never throw.
   - `store.list` skips corrupt records and reports them.
   - Both import paths validate.
   - Four tests added.
4. **Structural safety, step 0: a trust boundary.** Puzzle titles come from imported files and are shown in the library. If they're rendered with `innerHTML`, that's an injection path. **Fixed:** lint bans `innerHTML`, `outerHTML` and `insertAdjacentHTML`, so every view renders text through `textContent`. It's enforced by the linter, not remembered.
5. **Error path, step 10: large images and bad files.** A full-resolution phone photo through `getImageData` can stall the tab, and a file that won't decode had no defined behavior. **Fixed:** images are downscaled to at most 1024px on the long side, and a decode failure shows an error.
6. **Consistency.** The heading "Open decisions (yours)" was stale, since every decision is closed. **Fixed:** renamed.

**Clean checks:**
- Every contract named in the lane table has an owner step.
- Every "Depends on" cell references a step that exists.
- No step references the removed step 4 or old test names.
- `localStorage` quota: a 25x25 puzzle is about 2KB, so thousands fit. No change.

**Trend:** 9, 11, 6, 7, 6, then 6 now. Pass 6's findings are smaller than pass 4's: no lane stalls, no data model changes beyond the validators. Two (XML export and set save) came from edits in earlier passes that didn't carry through. That's the risk of reviewing a plan many times: each fix can open a new seam. A pass 7 would most likely mostly re-check pass 6's edits.

**Verdict:** Ready to execute. Start with step 0.

## Plan review: v1.1 play feedback, 2026-10-08

**Scope:** the "v1.1: play feedback" section of `PLAN.md` (steps 14a to 17), plus its Decisions log entry. First run with check 9 (trust-boundary upper bounds).

**Findings (all fixed in the plan):**
1. **#5, the N lane's contract: main would break between merges.** N removed `setSatisfied` from `grid.js`, but `play.js` (lane H) still calls it until step 17. Node tests would stay green while the browser broke. **Fixed:** N keeps `setSatisfied`. Step 17 swaps the call and then removes it.
2. **#7, `heartsStroke`: two builders could disagree on stroke mode.** "Applying the stroke cell by cell" didn't say how the mode is chosen, so one builder could reimplement the v1 rules and drift. **Fixed:** the mode comes from `applyStroke`, and only cells that `applyStroke` changes are walked. Added the test `heartsStroke follows the v1 stroke mode`.
3. **#7, step 14c: out-of-hearts state underspecified.** Not stated: whether the timer stops, what reopening a save with 0 hearts shows, whether the red cross is saved, whether hints cost hearts. **Fixed:** each is now stated.
4. **#7, step 14c: Restart on a solved puzzle.** v1 blocks every move once solved, so Restart could have inherited that block, which would defeat replay. **Fixed:** Restart works on solved puzzles.
5. **#7, `clueProgress`: "stop if the two scans meet" was ambiguous.** It could mean cells or clues. **Fixed:** the end scan stops at the first clue the start scan already marked.
6. **Gate lesson 5 at plan time, step 15b.** The planned test for `setClueDone` was a shape check on arrays, named as if it tested the DOM behavior. **Fixed:** removed; 15b is a manual check. Step 14c's view tests became a pure `restartCells` test in 14a.

**Clean checks:**
- #9: the only new numbers crossing a trust boundary are `hearts` (bounded 0 to `MAX_HEARTS`, integer) and `rules.zen` (boolean). The mistake mark isn't saved. No new imports.
- #6: D6 to D10 each carry a reason and a rejected option. D10's variant was picked by the reviewer, because the owner answered "5" without a variant, and the log says so.
- #3: tooling exists from v1.
- #1, #2, #4, #8: N/A. There's no model, no new personal data, and this isn't a showcase project. The one "never" property (a wrong cross never costs a heart) has a named test.

**Owner call flagged, not blocking (v1.1):** v1 saves load in hearts mode with full hearts (D7). An in-progress v1 game gains hearts it can lose.

**Verdict:** Ready to execute after the owner's go.

## Plan review: v1.2 UX pass 1 fixes, 2026-10-08

**Scope:** the "v1.2: UX pass 1 fixes" section of `PLAN.md` (steps 19a to 22, D14 to D17). Reviewed by the orchestrator, who also wrote the plan. That's weaker than a cold read, so the slim gate and UX pass 2 after the build carry more weight this time.

**Findings (all fixed in the plan):**
1. **#5, an unowned shared file.** The solve reveal has to cover exactly the cell area, which only `grid.js` knows, but no lane owned `grid.js`. **Fixed:** lane P owns it, with a frozen `setOverlay` contract that Create and print don't call.
2. **#5, verification gap.** The plan's done-condition is the UX checks flipping, but lanes can't run them, because the server serves `main`. **Fixed:** lanes verify with Node tests and report their DOM hooks; the orchestrator flips checks at step 22.
3. **#9, prefs read back from storage.** `play.zen` and `play.autoCross` come from localStorage. **Fixed:** anything but `true` counts as false.
4. **#5, a stray owned file.** Lane L listed `samples.js` with nothing to do in it (D15 renders the prefix and leaves the record alone). **Fixed:** removed from the lane.

**Clean checks:**
- #9: `art` is bounded (prefix and 200,000 characters) and `titleFromFile` is capped at 60 characters. There are no other new stored numbers.
- #6: D14 to D17 each carry a reason and a rejected option. D14 is explicitly pending.
- #7: each changed pure helper has an exact contract and named tests. View steps name their UX check.
- #2, the "never" property behind D14: art is only written by Create, only as a bounded JPEG data URL, and never sent anywhere. The rewritten test pins the bound.

**Blocking owner decision:** D14 (store a small copy of the crop) blocks 19f and 20c only. Everything else can start.

**Verdict:** Ready to execute after the owner's go. Without D14, the reveal becomes strip-only.

## Plan review: line-cap-300 (bring every source file to 300 lines), 2026-10-29

**Scope:** `docs/plans/line-cap-300.md` as first written (after the view split was merged and gated), reviewed against the checklist in the `/plan-review` skill including items 14 to 18 (added after the view split). Reviewer: a cold, read-only Explore agent that did not read the earlier review records or the view-split and e2e plans, plus the orchestrator's own checks of the code (file sizes, importers, which names the second half of `create-logic.js` uses from the first, the shared constants in `color.js`). Every finding cites the plan text it is about.

### Findings (first draft of the plan)

Blocking (checks 2, 5, 6, 9, 14, 15):

1. **Check 14, "Steps and parallelism" Wave 0 and "Decision: move to new files".** "Behavior must not change" with no equivalence proof and no audit of the safety net: Wave 0 only re-measured and mapped `renderGrid`; only `format.js` got mutations; `renderGrid` has no unit test, no test imports `library.js`, and the plan never named which UX checks cover the moved code.
2. **Check 9, "Wave 1" `format.js` bullet.** The boundary pinning covered three key lists and no magnitude bound: the nested allow-lists (`PALETTE_ENTRY_KEYS`, `PUZZLE_SET_KEYS`, `RULES_KEYS`), `pickKnown`, every `MAX_*` limit, `jpegSize` and `boundArt` were not mutated; `runImport` (forged-id filter, re-solve through `ratePlan`, write-failure path) moves in the library lane with no mutation assigned; the plan said results go in a Results section that did not exist.
3. **Check 15, "Wave 2" library bullet.** Lanes 2a and 2b both edit `library.js` (import header, call sites, `render`), with no resolver named; `addSamples` and `forThisMount`/`generation` sat in neither lane's region.
4. **Checks 5 and 7, "Proposed cuts" library row against the Wave 2 library bullet.** Two designs for the shared helpers (`el` becomes `elc`; `say`, `button`, `el` "passed in through a small context object") and the context object never specified; the module-level `let`s (`store`, `status`, `listEl`, `toolbarButtons`, `generation`) are cleared on `unmount` and must be read live.
5. **Check 16, "Proposed cuts" grid row and Wave 0 0b.** The `renderGrid` treatment was not adequate: the lane names and hours were fixed before the map existed; the map brief omitted setup order (`update` before the root is appended), teardown order (`destroy`), live reads (`button`, `hot`, `overlay`, `painted`), the returned API and its callers; the state-object step was priced as a pure move; no freeze point; no check named for pointer and drag paths.
6. **Checks 7 and 11, "Proposed cuts" `color.js` row.** Shared helpers with no owner (`SEED`, `ITERATIONS`, `MERGE_DE`, `mulberry32`, `lin`, `mean`, `rgbOfHex`, `hexOf`, `labToRgb`); `labToRgb` (used by the pixel path) absent from the leaf; the re-export decision needs the new files not to import the old path; the "printed palettes identical" check used `research/color/cluster.mjs`, which prints timings.
7. **Checks 5, 7, 11, "Proposed cuts" `create-logic.js` row.** An import cycle: `tileStatusLine` and `withVerdicts` (save half) call `verdictOf`/`reportView`, which stay in `create-logic.js`, and `create-logic.js` re-exports the save half. Membership ambiguous; ten importers not named.
8. **Checks 14 and 3, opening paragraph of "Steps and parallelism" and Wave 4.** The pre-registered verify (`node --test test/lint_size_cap.test.js`, "fails while the config says 500") could not fail the way the plan said: that test asserted 500 and passed.
9. **Checks 18 and 12, whole plan.** No lane brief template: no owned and forbidden files, must-pass commands, out-of-scope list, mutation list, stop rule or commit rules, for six parallel worktree lanes.

Advisory:

10. **Check 17, "Effort check".** Mechanical edits and design work priced together (`format.js` 3h bundles the cut with mutations; the grid steps billed as pure moves); the provisional tables never frozen.
11. **Process, opening paragraph and Wave 4.** The plan gate, `activate`/`verify` and who owns the single activation were not represented; the row had no `plan`.
12. **Wave 4 test text.** Did not say to change `MAX`, the titles, or add the root `src/x.js` case, nor that the scope and blank-line tests stay; the "fails if any file passes 300" claim is carried by `npm run lint`, not the test.
13. **Check 2, "Decision" and Wave 1 sentence on lanes not editing each other's files.** Property claims with no check (no cycles, "nothing is deleted").
14. **Stale text.** The starting-point table said "before the view split"; the config comment and `AGENTS.md` name 500.
15. **Re-export hygiene.** `export *` versus named, and where the lines go, unspecified; no check that the export set is unchanged.
16. **Wave 4 lint result.** No other `src/` file is over 300 today, but the new files' sizes were estimates (`samples-art.js` about 275 plus header) and no step counted them.

### Clean checks

6 (the "move and keep the old path" and "keep the D25 path" decisions carry reasons); 9 in part (the plan names `format.js` as the boundary); the consumer search (`research/color/*.mjs`, `test/ux/checks.js` and the tests are the only extra importers, and re-exports keep them working); the file list (exactly six files are over 300 today); the gate (its own `/gate-review`, no push, local merges only).

### Disposition (plan edited; what changed)

| Finding | Fixed in the plan |
|---|---|
| 1, 13, 15 | New "Safety net and equivalence proof" section and Wave 0: a mutation audit of all six files (0c) with survivors closed (0e) before any move; `scripts/dom-compare.mjs` (rendered pages against a baseline commit in headless Chrome) and `scripts/export-names.mjs` (export set unchanged); `test/module_graph.test.js` (no cycles, no new file imports its barrel); one split test per split with a rule that comments do not count; decision 1 fixes `export * from` as the re-export form |
| 2 | Wave 1 `format.js` mutations extend to the nested allow-lists, `pickKnown`, every `MAX_*` bound, `jpegSize` and `boundArt`; the 0c-2 audit names `runImport` explicitly and 0e closes it; a Results section exists |
| 3, 4 | Decision 4 (one `lib` state object in `library-state.js`, read at call time, `render` reached as `lib.render()`) and Wave 2: a foundation step 2a pre-registers the header and stubs; 2b and 2c own named regions; `addSamples` stays in `library.js`; merge order and resolver stated; `elc` is the only helper change |
| 5, 10 | Decision 5 and the freeze point: grid's cut, hours and steps are decided by the map and frozen before its lanes start; the map brief now lists setup order, teardown order, live reads, the returned API and callers; the state-object step is priced as design; any step over 3.5 hours is split and that section re-reviewed |
| 6, 7 | "Frozen cuts": `color-space.js` leaf owns every shared constant and helper including `labToRgb`; `create-verdict.js` leaf holds `verdictOf`, `reportView`, `STATUS_TEXT`, `DEFAULT_PALETTE`; decision 2 (leaves first, no cycles) pinned by the module-graph test; the colour probe is a small script, not `cluster.mjs`; importers named |
| 8, 12, 16 | The row's verify names every split test explicitly and ends with lint and the UX checks, so it cannot pass early (rule 3) and fails if a file is deleted (rule 10); Wave 4 specifies the test change (`MAX = 300`, the probe paths including a bare `src/x.js` and `.mjs`, the tests that stay) and says lint carries the claim; every lane reports `wc -l` of its new files, with a fallback for `samples-art.js` |
| 9 | The "Lane brief template" section, with the known traps from the view split |
| 11 | Decision 6: the row names the plan, the orchestrator records the review and owns the single activation and the final verify and restamp |
| 14 | Starting-point table dated and re-checked; Wave 4 updates the config comment and `AGENTS.md` |

### Verdict

Ready to start Wave 0 after the owner's go. **Not ready for Waves 1 and 2 until the freeze point:** grid's cut, the library file list, the survivors and the sized steps are decisions resolved in Wave 0, and the updated sections are reviewed again before any extraction lane starts.

## Plan review: line-cap-300 after the Wave 0 freeze, 2026-10-30

**Scope:** the sections of `docs/plans/line-cap-300.md` updated at the freeze (commit `a6bef34`): Decisions 1, 2, 4, 5, "Frozen cuts", the library table, "Grid cut (frozen)", Pricing, Waves 1 to 4, the feature-row verify, the lane brief template and Results. Reviewer: a second cold read-only Explore agent that did not read this document or any gate doc, and read the plan against `src/`, `scripts/`, `test/module_graph.test.js`, `test/helpers/split.js` and `FEATURES.json`. Every finding cites plan text and the code that contradicts it. The orchestrator confirmed findings 1, 2 and 5 against the code (`src/color.js` lines 12, 13, 57, 106, 117, 163, 255 to 273; `src/views/grid.js` line 17).

### Findings

Blocking:

1. **Decision 1 and "Frozen cuts" `color.js` row against `scripts/export-names.mjs` and the split helper.** `SEED`, `ITERATIONS`, `rgbOfHex`, `mulberry32`, `d2` and `mean` are private today. The leaf must export them for `color-cells.js`, so `export * from './color-space.js'` adds six names to `color.js` and `export-names` fails; a named list passes `export-names` but fails the helper, which recognised only `export *`. Lane 1d would hit the two-failures stop.
2. **"Frozen cuts" `color.js` rows.** `d2` (used by both paths) had no owner; `SEED_FALLOFF`, `MAX_PALETTE_PIXELS` and `sampleStep` were unassigned; the pixel path also uses `cellRange` from `image.js`. The pixel path is lines 254 to 457, so `color.js` ends near 225, not 180.
3. **Feature-row verify against AGENTS rule 10.** It did not chain `test/ux_registry.test.js` (the file's own comment says it is chained) or the four `test/linecap_*.test.js` files: deleting `pipeline-linecap-grid.js` and its spread leaves the verify green with the grid safety net gone.
4. **Wave 2 and the lane brief.** `split_library` and `split_grid` had no owner (2b and 2c would both edit one file, or one would break "may not touch any other lane's files"); `FAMILIES` had no grid entry, so nothing pinned `grid-layout.js` and `grid-pointer.js` against importing `grid.js`.

Advisory:

5. **Grid cut.** `BUTTONS` (read only by `onDown`) had no file; `inks` (line 84, inside the "setup block") is needed by `update`; `export *` from `grid-layout.js` would leak `buildGrid` and `div` into `grid.js`.
6. **Library step 2a.** Who adds the imports and what the stubs export was unspecified (an empty stub with an import is a link error, an unused import fails lint); the `el` to `elc` rename of 37 call sites was missing; the two lanes' import lines were adjacent.
7. **Samples and library text.** `ART` and `COLOR_ART` are private, so `export *` would fail `export-names` for `samples.js`; Decision 4 still said six fields while the table said `root` and `listEl` stay local; `library-state.js` import path should be `./dom.js`.
8. **`create-save-logic.js` imports.** `tileStatusLine` calls `difficultyLabel`, so `difficulty.js` is needed; the remaining `create-logic.js` is about 155 lines, not 120.
9. **Pricing.** 2a and 2f mix design and mechanical; 1d was labelled mechanical but held the unresolved decisions of findings 1 and 2.
10. **Lane brief.** VERIFY omitted `dom-compare` and the color probe, `<baseline>` was undefined, and a lane that needs a helper or `module_graph` change had no instruction.
11. **Wave 4 and the proof.** Wave 4 did not mention `FAMILIES` for grid or the `lint_size_cap` header comment; `export-names` and `dom-compare` were not part of the feature verify; the recorded `plan_sha` was stale (it is checked only in `activate`, and the row is already active).

### Clean checks

Equivalence tools that can fail (`export-names` compares full sets including star chains, `dom-compare` has `--self-check`, `module_graph` has synthetic-cycle tests, the split helper rejects stubs and comments); sizes match `wc -l` and no unlisted file is over 300; the `format.js` and `create-logic.js` cuts (private helpers stay private, no cycles, nothing new exported); library sizes, `lib` fields, `generation`, `store0` snapshot, render hook and the 2b and 2c regions; Wave 1 lane file disjointness and sequential 2e then 2f; the grid order invariants against the code (`update(cells)` at line 331 before `container.append(root)` at line 332, `destroy` order); the layout and docs tests do not pin the new files or "500 lines"; the Wave 4 lint test fails against 500 and passes after; 619 unit tests and the 73 UX checks add up (45 in `checks.js`, 6 pipeline, 22 linecap); `tsc` is not `strict`.

### Disposition (plan edited; what changed)

| Finding | Fixed |
|---|---|
| 1 | Decision 1 now picks the re-export form per file: `export *` only where the new file adds no names (`format.js`, `create-logic.js`); a named list of exactly the old names for `color.js` and `grid.js`; a plain import for `samples.js` and `library.js`. `test/helpers/split.js` gained `namedReExports` and `importsFrom`, tested in `test/module_graph.test.js` (16 tests, with comments, strings, other specifiers and `export *` as negative cases) |
| 2 | `d2` and every other shared name is in `color-space.js`; `SEED_FALLOFF`, `MAX_PALETTE_PIXELS`, `sampleStep` stay in `color.js`, which also imports `image.js`; the exact re-export lists are written out; size updated to about 225 |
| 3 | The verify in the plan and in `FEATURES.json` now chains `test/ux_registry.test.js`, the four `test/linecap_*.test.js` files and `node scripts/export-names.mjs ca93716` (`features.py check` passes) |
| 4 | "Split-test ownership": one split test file per lane (`split_library_state`, `split_library_backup`, `split_library_sets`, `split_grid_layout`, `split_grid_pointer`, plus the four Wave 1 files), each existing only once its lane lands so `main` stays green; `FAMILIES` gained `views/grid.js`; no lane edits `module_graph` or the helper |
| 5 | `BUTTONS` goes to `grid-pointer.js`; `inks` is computed once in `renderGrid` and passed to `buildGrid`; `grid.js` re-exports `gutterSize` and `blankStyle` by name |
| 6 | 2a also renames `el` to `elc`, creates the two files as empty modules (`export {}`), and arranges the header with a slot per lane and unchanged lines between them |
| 7, 8 | Samples plain import; Decision 4 text corrected; `./dom.js`; `difficulty.js` import and 155-line estimate |
| 9 | Accepted as written: the mixed rows are labelled honestly (2a and 2f are "design + mechanical" at 3 hours); 1d's decisions are now in the plan, so it is mechanical |
| 10, 11 | Lane brief VERIFY names `dom-compare`, the color probe, `ca93716`, and the stop rule for helper changes; Wave 4 lists the header comment; `export-names` is in the verify; the review is re-recorded with `plan-reviewed` (below) |

### Verdict

Ready for Waves 1 and 2 once this review is recorded. The four blocking findings were real defects against the code and are fixed in the plan, the helper and the ledger.

