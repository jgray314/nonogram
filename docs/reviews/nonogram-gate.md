# Nonogram Studio: gate reviews

# Pass 1: adversarial + walkthrough, 2026-10-08

**Run:** 2026-10-08.
**Scope:** `main` at `e97b8a5`, which is the full v1 (steps 0 to 12s) before the gate. Fixes landed in `a38a332`, `bc3d580`, `efecb74` and `6fca7ac`.
**Prior runs:** none. The pre-build plan reviews are in `nonogram-plan-review.md`, and the reviewers did not see them, so both lenses ran cold.
**Reviewers:** two read-only Explore subagents on Sonnet, with no write access, each forming its findings independently. The orchestrator (Opus) reproduced the High before fixing it.

**Step 0, backlog prune.** The plan's deferred list (color mode, XML import, tablet touch) was written the same day, so nothing was stale. The real gap was that the "noticed but not fixed" items from lane reports were recorded nowhere. They are now collected in PLAN.md "Backlog (post-v1)", each with a trigger, a kill, or an unreproduced note.

## Lens 1: Adversarial

### HIGH
- **H1 (NEW). One imported record could make the library permanently unrenderable.** `validatePuzzle` didn't bound `set.row` or `set.col`. A record with `row: 100000` passed validation, and `groupSets` then allocated `rows*cols` and threw `RangeError` inside `library.mount`. The record stays in localStorage, so the library never loads until browser data is cleared. Reproduced by the reviewer.

### MEDIUM
- **M2 (NEW). Empty ids passed validation, then threw mid-import.** The library import loop had no error handling, so this caused a partial import with no message. Quota errors took the same path.
- **M3 (NEW). Imported ids were trusted, never checked against content.** A forged id could attach a save to the wrong puzzle, an id of `demo` loaded the built-in demo, and save import silently replaced existing progress.
- **M4 (NEW). A failed set save could delete progress.** The rollback removed every id it had written, including tiles that already existed (a re-saved identical set reuses the same ids), along with their saves.
- **L5, rated Low-Medium (NEW). Export said "Library exported." while silently leaving out corrupt records.**

### LOW
- **L6 (NEW).** A malformed `%` escape in the hash threw in the router and left a blank page.
- **L7 (NEW).** Async handlers can outlive their view. File import awaits in library, play and create can touch torn-down state after you navigate away mid-read.
- **L8 (NEW).** Control characters in a title produced invalid XML.
- **L9 (NEW, design).** Auto-cross treats a line as satisfied when your fills match its clues, even if they're in the wrong place. It then crosses the true cell too.
- **L10 (NEW).** The solver's color bitmask (`1 << c`) breaks at 31 or more colors, and 25x25 structured puzzles were not timed at the real budget.
- **L11 (NEW), minor:**
  - `e.key` can be undefined in the key handler.
  - Elapsed time isn't saved on tab close.
  - Duplicate ids within one backup file.
  - Download filenames can end in "." and don't avoid Windows reserved names.
  - Nothing warns when you leave Create with unsaved work.
  - A solved puzzle can't be reset.
  - Saving an identical grid overwrites the title.
  - A `__proto__` id in `groupSets`.

### Weak tests flagged
- The smoke test asserted `1 + 1 === 2`.
- "report updates after edit" doesn't test an edit.
- "save waits for a fresh report" only tests the `canSave` predicate.
- "25x25 completes under 1s" ran at budget 50 and accepted any status.
- The Otsu tie rule isn't pinned.
- There's no test of the stale-result race in `create.js`.

### Verified clean
- **Solver.** The reviewer ran independent brute-force oracles, stronger than the repo's own:
  - 4,000 random 3-color lines through `solveLine`: 0 mismatches.
  - Exhaustive 3x3 two-color grids (19,683) for unique vs multiple: 0 mismatches.
  - Edge cases checked: 1xN, empty clues, a clue longer than its line, contradictions, 0x0, `n:0`. Budget semantics hold, and `unknown` is never reported as unique.
- **Image, clues and tiles.** Cell boundaries, alpha compositing, threshold direction, `otsu` with a single class, crop clamping, and the single global threshold for tiles.
- **Format and storage.** The id canonicalization (fixed key order, lowercased hex, `set` only when present) is correct, and the validators never throw. `gridError` checks the row count before iterating, so an inflated declared width can't allocate. `store.list` skips corrupt records and orphan saves.
- **Security.** No `eval`, `new Function`, or innerHTML-family sinks. Imported text always goes through `textContent`. `href` values are literals, blob URLs, or encoded ids. Palette hex is regex-checked before reaching `fillStyle`.
- **Play and create.** Solve detection is clue-based. Undo can't pass the solved lock. Listeners are removed on unmount and destroy. In the creator, `reportRun` staleness is checked after every await, so a stale verdict can't be saved.

## Lens 2: Outside-reviewer walkthrough

- **W1 (NEW, High).** No README. The only run instructions were buried in PLAN.md step 0 and the owner's local tool index.
- **W2 (NEW, High).** PLAN.md reads as a future-tense spec and build log, not a record of what exists. The lane and branch machinery dominates it.
- **W3 (NEW, High).** A dev-only `#/play/demo` route shipped in the UI and bypassed the store.
- **W4 (NEW, High).** PLAN.md had uncommitted edits: the backlog section, which was in progress at review time.
- **W5 (NEW).** Q6 and step 10 described the default grid size as "closest preset pair to aspect". The code pins the long side to 15.
- **W6 (NEW).** The reviewer said the plan's "no co-author trailer" rule clashes with the session's attribution convention.
- **W7 (NEW).** Stale specifics: a hard-coded test count, and the budget-50 noise test described as if it hit the budget.
- **W8 (NEW).** The decisions log is out of order, and some entries are undated.
- **W9, W10, W11 (NEW).** Overclaiming test names, and a duplicate test name (`difficulty label from verdict` in two files). Overlaps Lens 1's weak tests.
- **W12 (NEW).** Duplicated `el()` helper in four views with two signatures, duplicated download code, and inconsistent CSS loading between views.
- **W13 (NEW).** Dead or test-only exports.
- **W14 (NEW).** The `difficulty.js` comment says "step 13" without naming PLAN.md.
- **W15 (NEW).** Leftover artifacts: the plan-review doc at the root, and the `../nonogram-wt/` worktrees.
- **W16, W17 (NEW, cosmetic).** Two color sources (base.css fallback and theme.js; a test pins them together). The `play-state.js` vs `game.js` split is unclear, and names mix `nng`, `nonogram-studio` and "Nonogram Studio".

## Disposition

| ID | Disposition |
|---|---|
| H1 | **Fixed** `a38a332`. `set.row` and `set.col` are bounded to 0 to 3, and set rows and cols to 1 to 4 (`MAX_SET_SIDE`). **Proof: mutation-verified guard.** Removing the row bound makes `validate bounds tile set position and set size (gate H1)` fail; restoring it passes. Records already in storage with a bad position are now skipped by `store.list` instead of crashing the library. **Shape sweep** (same unbounded-number defect class): width and height are now capped at 25, and palette length at 30, the solver bitmask limit. Fixed in `6fca7ac` with a test written first (red, then green). |
| M2 | **Fixed** `a38a332`. Empty `id` and `setId` are rejected (test red, then green), and the import loop now reports "Import stopped after N of M records". |
| M3 | **Fixed** `a38a332`. `idMatches` recomputes the hash (test red, then green). Library import skips forged puzzles and their saves. Save import rejects mismatches and asks before replacing progress. The `demo` spoof went with W3. |
| M4 | **Fixed** `bc3d580`. `rollbackTargets` spares records that existed before the save (test red, then green). |
| L5 | **Fixed** `a38a332`. Export reports how many corrupt records were left out. |
| L6 | **Fixed** `bc3d580`. A bad escape falls back to the library route. |
| L7 | **Deferred.** Trigger: any error report from navigating during an import, or the next time those handlers are touched. Fix shape: a per-mount generation token, checked after each await. Real but needs a mid-read navigation, and the worst case is a console error or a leaked listener, not data loss. **Gate pass 6:** the trigger fired (public-prep added a solver await to both handlers); fixed, see pass 6. |
| L8 | **Fixed** `bc3d580`. Control characters are dropped before escaping (test added). |
| L9 | **Noted only.** It matches how auto-cross works in other games: it reasons from the clues, not the answer. Auto-cross is off by default, and Check exists for this. |
| L10 | Bitmask part **fixed** by the palette cap in `6fca7ac`. 25x25 timing at the real budget is **fixed** in `efecb74` (nine seeded noise grids at `DEFAULT_BUDGET`, each under 1s). Structured worst cases stay under the "Limits" table item until real 25x25 puzzles exist. |
| L11 | `e.key` **fixed** in `6fca7ac`. The rest are **noted only**, since they're minor UX for a single-user tool. Elapsed-time-on-close and leave-Create-warning join the backlog's "after about 5 puzzles played" trigger. **Gate pass 6:** killed with that group (no hands-on round raised them). |
| Weak tests | Smoke test **deleted**. Three tests **renamed** to say what they assert (`efecb74`). Noise timing **replaced** with a real-budget test. The Otsu tie pin and the create stale-race test are **deferred**: the race is guarded in code (verified clean above), and testing it needs DOM wiring this repo doesn't unit-test. **Gate pass 6:** Otsu tie pin fixed; stale-race test killed (guarded in code, no DOM harness). |
| W1 | **Fixed** `efecb74`. README added with what it is, how to run it, the routes, dev commands and doc pointers. |
| W2 | **Partly fixed.** The status line is now an as-built summary. Moving the lane machinery to an appendix is **deferred** until the next plan edit. It's an accurate record of how this was built, just long. **Gate pass 6:** killed; skipped at every plan edit since, and the as-built record is accurate. |
| W3 | **Fixed** `bc3d580`. Demo route removed. Samples cover the use. |
| W4 | **Fixed** `efecb74` (the backlog committed). |
| W5 | **Fixed** `6fca7ac`. Q6 and step 10 now state the as-built rule. |
| W6 | **Rejected.** The owner's standing rule is no AI co-author trailer in their personal repos, and the commit hook enforces it. The session's default convention doesn't override the owner's instruction. |
| W7 | **Fixed** `6fca7ac` (no hard-coded count) and `efecb74` (the test now matches its description). |
| W8 | **Deferred** with W2, to the next plan edit. **Gate pass 6:** killed with W2. |
| W9 to W11 | **Fixed** `efecb74`. |
| W12 | **Deferred.** Trigger: the next change touching two or more views. Extract `src/views/dom.js`, a shared download helper, and one CSS-loading convention then. Duplication beats premature reuse until a change has to touch all copies. **Gate pass 6:** the trigger fired with public-prep, which didn't touch the duplicated pieces. Re-deferred to the color UI build (create, play and grid). |
| W13 | **Noted only.** Most are test seams. Un-exporting would force tests through views. |
| W14 | **Fixed** `6fca7ac`. |
| W15 | Plan-review doc: **kept**, and the README now points to it. Worktrees: **pending the owner**. They're merged and safe to remove, but deleting needs the owner's OK. |
| W16, W17 | **Noted only.** The color drift is test-pinned, and the naming is cosmetic. |

**Close checks:**
- No open Critical or High.
- **Claim grep:** "demo" and "119 tests" appear nowhere in `src/`, README or PLAN status. The default-size claim was updated in both places it appears.
- **Checks:** `npm test` passes 125 of 125, and lint and format are clean.
- **CHANGELOG:** none to compact (this repo has none, by design).
- **Cross-session notes:** the owner's notes outside the repo list the open items.

## Retrospective

**Draft from the phase record.** Each lesson cites its evidence. The owner's lessons follow and outrank the draft where they differ.

1. **Lane reports can't be trusted as the record. The branch is.** Two of about 12 lane runs returned an empty or placeholder report (lane B step 2; creator steps 11b to 12c). Another broke the two-failure stop rule (lane A made a third attempt). Every merge was verified from `git log`, the diff, and a fresh `npm test`, and that caught nothing wrong. The verification habit is what made the reports' unreliability harmless.
2. **The hand checks in the browser found bugs no test could.** These were all found by running the merged app in the browser pane:
   - a blank tile that could never be solved
   - the hidden "Solved" banner showing as an empty pill
   - form controls staying unthemed in the evening theme
   - a cached placeholder view
3. **The plan reviews caught contract gaps but not size bounds.** Six plan passes added validators (pass 6). Every validator checked shape and none checked magnitude, and that's exactly where the gate's only High sat. A plan-review check for "every number that crosses a trust boundary has an upper bound" would have caught it before code existed.
4. **Step estimates were 3 to 20 times too high for agent lanes** (W1r: 0.5 to 4 minutes per step, against 10 to 15 estimated). Step size still earned its keep as a review unit.
5. **Test names written from the spec list overclaimed.** Three tests were named for the property in the prompt ("waits for a fresh report", "updates after edit") when only a helper was testable in Node. Lane prompts should say: if the property needs DOM or timing, name the test for what it actually asserts and flag the gap.
6. **Sonnet was enough for every contract-bound lane.** No step hit the upgrade-to-Opus rule. The solver, the hardest step, passed both of the reviewer's independent oracles.
7. **(Orchestrator working style.)** Shell heredocs mangled backslash escapes twice: once in a plan edit, once in the XML escape regex. Content heavy in escapes goes through the file editor or `chr()`, not the shell.

**Owner's lessons (2026-10-08, in their words):**
- A. "While I knew estimates were off from prior experiences the degree still caught me off guard. I'd like to update default guidance on appropriate scale to subdivide work based on the experiences from JSCC and this project. Gate review did seem to be right size still."
- B. "Was happy with parallelization, though it required more iteration in the planning stage to shake out dependencies. Good so far, but this is probably the best that will get."
- C. "Test name over claim is a pattern seen before. May make sense to add that into standard checks even at the per commit level."
- D. "Was expecting sonnet to be sufficient for individual steps with opus acting as planner orchestrator. Parallelizing felt faster."
- E. "I think similar mangling happened in JSCC. Worth flagging as a general process update if so."
- F. "Overall I again felt the nothing to first touchable version was amazingly fast and clean. Now to see how things extend and age."

**Dispositions:**
- **Draft 1** (reports aren't the record): *applied* in the project's cross-session notes ("always verify from the branch"). Verification already ran on every merge.
- **Draft 2** (hand checks found what tests couldn't): *noted only.* The plan already had `[manual]` checks on merged `main`, and they worked.
- **Draft 3** (no size bounds): *applied.* Added check 9, "every number crossing a trust boundary has an upper bound", to the `/plan-review` skill. It blocks by default, like checks 1 to 6.
- **Draft 4 and A** (estimates far too high; gate size right): *applied* (owner chose option 2). Work is now sized by review unit, not by clock, and the estimate rules are separate, in the owner's multi-week planning guidance and decisions log. Gate size is *noted only*: it stays as is.
- **Draft 5 and C** (test names overclaim): *applied.* Added Step 8, "test names match what they assert", to the `/pre-commit-check` skill. It's scoped to new and renamed tests so it stays seconds-fast.
- **Draft 6 and D** (Sonnet enough; Opus orchestrates): *noted only.* This matched the expectation and is already the standing rule in the owner's notes on subagent models.
- **B** (parallelization worked, at a planning cost): *noted only.* The planning iterations on dependencies are the price, and no cheaper method is in view.
- **Draft 7 and E** (shell mangling): *applied.* JSCC had the same class of bug: PowerShell text steps without a UTF-8 flag caused mojibake twice, and PowerShell 5.1 redirects write UTF-16. Added a general rule to the owner's coding preferences and cross-session notes: file content goes through the file editor, and any shell text step sets its encoding explicitly.
- **F** (how it extends and ages): *deferred.* Trigger: the first change after v1, whether color mode or a backlog item. Check then whether the frozen contracts and tests made the change easy or got in the way. **Gate pass 6:** killed. It was never answered, and five passes of retrospectives have since covered how changes landed.

# Pass 2: slim gate on v1.1, 2026-10-08

**Run:** 2026-10-08. **Scope:** the v1.1 commits only, `adf2294..f6266fd` (steps 14a to 17), scoped slim per the skill. Fixes are in the pass 2 fix commit.
**Prior runs:** pass 1 above. Neither reviewer was shown it.
**Reviewers:** two read-only Explore subagents (inheriting Opus), cold, no write access.
**Step 0, backlog prune.** The v1.1 testing notes moved from the backlog into the plan and shipped. Nothing else in the backlog aged.

## Lens 1: Adversarial

- **M1 (NEW, Medium). One filled run could mark two clue numbers done.** With no unknown cells left in a line, the start and end scans in `clueProgress` both crossed the whole line and matched the same run. Example: clue `1 1`, line `filled, cross, cross`. Reachable in hearts mode, because a wrong cross is free. The flaw was in the plan's contract wording too ("stops at a clue the start scan already marked").
- **M2 (NEW, Medium).** The test `start and end scans never match the same number twice` couldn't fail: it passed with or without the guard. Same root as M1.
- **L1 (NEW, Low).** Hearts trust an imported puzzle's `verdict`. A hand-edited verdict on a puzzle with several solutions would turn hearts on, and a fill that's right for the other solution would cost a heart. The same gap already existed for check and hint in v1.
- **L2 (NEW, Low).** One stroke can solve the puzzle and lose the last heart, because the wrong cell gets crossed, and that cross is correct. "Solved" wins.
- **L3 (NEW, Low, design).** Zen mode can be switched on and off mid-game, so hearts are easy to dodge: switch to Zen, use Check mistakes, then switch back.
- **L4 (NEW, Low).** The not-fair note text drifted from the plan.
- **L5, L6 (NEW, Low).** A wrong comment in the `heartsStroke` mode test. `restartCells` was tested against `crossEmptyLines`, its own building block.
- **L7 (NEW, Low).** A hand-edited save with `hearts: 0` and Zen on plays normally until Zen is turned off, then locks. This is consistent with the spec.

**Verified clean:** the `heartsStroke` contract; out-of-hearts blocks every input path; Restart resets state and history; `validateSave` bounds and v1 compatibility on every import path, with no import cycle; empty-line crossing isn't an undo step and isn't dirty; colour runs; hidden elements; the print key.

## Lens 2: Outside-reviewer walkthrough

- **W1 (NEW, Medium).** PLAN status line, steps 14a to 17 not marked done, and no record that the manual checks ran.
- **W2 (NEW, Medium).** README stale on print, and silent on hearts, Zen and Restart. The same claims were stale in the owner's tool index.
- **W3 (NEW, Medium, corroborates M1 and M2).** The overlap test can't fail, and a test comment contradicted its assertion.
- **W4 (NEW, Medium).** A fresh game and Restart built their starting grid in two places, against the contract.
- **W5 (NEW, Medium, same as L4).** Two strings and two predicates for one requirement.
- **W6 (NEW, Low).** v1 decisions (decision 1, D2) not marked as superseded. Stale header comments in `print.js` and `format.js`. The `grid.js` doc didn't mention the red cross. A test name claimed less than it asserted.
- **W7 (NEW, Low).** Layering: `format.js` imports `game.js` for one constant, and `clue-progress.js` re-implements column extraction. Print lane commit had no body.

**Cross-lens agreement:** M1, M2 and W3 were found independently, one by running inputs and one by reading the test. That's the strongest finding of the pass.

## Disposition

| ID | Disposition |
|---|---|
| M1, M2, W3 | **Fixed.** The end scan now only sees cells the start scan didn't consume. New test `one filled run never marks two numbers` failed before the fix (`[true, true]`) and passes after. The plan contract is corrected. Comment fixed. |
| W1, W2 | **Fixed.** PLAN status, steps 14a to 17 marked done with the manual-check record, README play section, tool index entry. |
| W4 | **Fixed.** A fresh game starts from `restartCells`. |
| L4, W5 | **Fixed.** One note in `helpersAvailability`, used as is. Plan text updated. `heartsAvailable` stays as a named alias. |
| L5, L6, W6 | **Fixed.** Comments, the `restartCells` test now asserts a literal grid, the test with the over-narrow name is split, and decisions are marked superseded. |
| L3 | **Fixed** by owner decision D12. Switching back from Zen to hearts restarts the puzzle. Manual check in the browser. |
| L1 | **Accepted residual.** It only arises from a hand-edited import, and this is a personal tool. Trigger: sharing puzzles with other people, at which point imports re-solve. Recorded in the PLAN backlog. |
| L2 | **Accepted.** Solved wins, and the heart loss still shows. |
| L7 | **Accepted.** Consistent with the spec. Only reachable by editing a save. |
| W7 | **Noted only.** It's small, and `MAX_HEARTS` is a game rule. Revisit if a third module needs game constants. The commit body can't be changed without rewriting pushed history. |

**Close checks:** 152 tests pass, lint and format are clean. Claim grep: no "answer key on page 2" left as a default claim, no `setSatisfied`, no "Check and hint need".

# Pass 3: slim gate on v1.2, 2026-10-09

**Run:** 2026-10-09. **Scope:** the v1.2 commits, `7284acd..e10193a` (prep, lanes C, P and L, step 22's UX checks). Fixes are on branch `gate3-fixes`.
**Prior runs:** passes 1 and 2 above. Neither reviewer was shown them.
**Reviewers:** two read-only Explore subagents, cold. UX pass 2 ran alongside (`nonogram-ux-review.md`); its findings are cross-referenced here where they touch code.
**Step 0, backlog prune.** Two items were stale: the trust item still said "check" (gone since D13), and "the grid scrolls rather than shrinking" was partly fixed by 20f. Both reworded. "A solved puzzle replays the glow" was re-checked: the picture reveal doesn't replay. The color, solver and feel items keep their triggers.

## Lens 1: Adversarial

- **H1 (NEW, High). "Not started" depended on leaving within a second.** The timer ran from the moment of opening or restarting, and the library calls a save not started only under 1 second. Restart, look at the grid for 2 seconds, leave: "in progress", the exact UX14 complaint. The UX check passed only because it left within milliseconds. UX pass 2 saw it independently (UX14 "partly": 5,714ms after idling).
- **M1 (NEW, Medium).** The "0" clue for empty lines lived in the shared `renderGrid`, so it reached Create (a tile set, which passes empty clue lists on purpose, got a "0" on every line) and Print (empty lines printed as a pale "0"). The plan said Create and Print were unchanged. No test covered a non-Play caller.
- **M2 (NEW, Medium).** The save's `hints` bound said "each hint reveals a different cell". Reveal, undo, reveal reveals the same cell twice, and play.js silently capped the count. A wrong reason in a contract.
- **M3 (NEW, Medium).** On a 25x25 the grid took all the height, so the solved strip landed below the fold.
- **L1 (NEW, Low).** Continue in Zen doesn't write the Zen default, unlike the switch, and the code didn't say whether that was meant.
- **L2 (REPEAT-OF-H1 pass 1, shape).** The new `art` field is bounded, but imported `title`, palette `name`, `set.id` and `verdict.sweeps` had no upper bound, and unknown keys pass through. Same unbounded-input shape as pass 1's H1. The art bound counts characters, not decoded pixels.
- **L3 (NEW, Low).** Art from a pixel-art source is a few pixels and would reveal as a blur.
- **L4 (NEW, Low).** A 4x4 tile set with art could store about 3.2M characters at worst.
- **L5 (NEW, Low).** When every solution fill is in but a wrong fill remains (only from an imported save), Reveal silently did nothing.
- **L6 (NEW, Low).** Tests weaker than their names: the art-bound loop never saw a record with art, no exact-boundary test, the hint reset was checked on one restart path of three, and the not-started check passed on timing.
- **L7 (NEW, Low).** Create's `createEditHistory` duplicated `createHistory`, which gained `canUndo`/`canRedo` in the same release.

**Verified clean:** D18 resets on all three restart paths; D12; `hintCell`; prefs read strictly; art on every import path, set as an `img` property only, excluded from the id; the Create draft lifecycle and listener cleanup; Play cleanup; library order and `sampleLabel`; the theme flash class; zero clues stay out of the progress flags.

## Lens 2: Outside-reviewer walkthrough

- **W1 (NEW, High).** README described v1.1: no Continue in Zen, Undo buttons, Reveal and hints, the reveal, the library changes, Create's draft. And nothing said a JPEG of the source crop is now stored and goes into backups, which matters for a repo that may go public.
- **W2 (corroborates M2).** The hints-bound comment contradicts play.js's own comment.
- **W3 (corroborates L7).** Two lanes built the same undo helper.
- **W4 (NEW, Medium).** The solve reveal, v1.2's headline, had no automated check: no seeded puzzle had art, yet `play-solved-strip` cited D14.
- **W5 (NEW, Medium).** PLAN status, the v1 "the source image is never stored" line not marked reversed, the lanes table rows, and two stale backlog items.
- **W6 (NEW, Medium).** Test names: `check disabled when not unique` (check is gone), and two grid tests whose names read as contradicting each other.
- **W7 (NEW, Low).** The art-bound test (same as L6), the 0-clue check didn't say which row or check the done style, and a duplicated `solvedSummary` assertion.
- **W8 (NEW, Low).** Stale comments: "or later a hint", a malformed "(D: UX2)" tag, and a redundant pref cleanup in a UX check.
- **W9 (same as L1).**
- **W10 (NEW, Low).** Three commit subject styles across the lanes, and step 22 closed without its docs half.
- **W11 (NEW, Low).** Three review docs and `ux-checks.html` sit at the project root.

**Cross-lens and cross-review agreement:** H1 was found by the adversarial lens from the code and by UX pass 2 from the screen. M2/W2 and L7/W3 were each found by both lenses.

## Disposition

Owner's calls: "H1: start timer with first click", "rest clean up per your recommendation", and, mid-pass, the auto-cross request recorded as D19.

| ID | Disposition |
|---|---|
| H1 | **Fixed** (`34911f0`). The timer starts with the first click on the grid, or a first hint. Restart and open leave it stopped. **Proof, mutation-verified:** with the guard removed, `library-restart-reads-not-started` (now idling 1.5s before leaving) fails with "reads in progress"; with it, it passes. The first attempt at this proof passed with the fix removed, for two reasons: the browser pane was hidden, so `document.hidden` stopped the timer whatever the code did, and the static server let the browser reuse cached modules. The harness now reports the frame as visible (`19f4c00`), and the proof ran on a fresh port with caching off. |
| M1 | **Fixed** (`34911f0`). `renderGrid` and `gutterSize` take `zeroClues`, and only Play passes it. Test: `without zeroClues (Create, Print), empty lines add no gutter`. |
| M2, W2 | **Fixed.** The format.js comment and D18 now call the bound a sanity cap. The cap stays. |
| M3 | **Fixed.** The grid sizing keeps room under the grid for the legend and the strip. |
| L1, W9 | **Fixed.** A comment says Continue in Zen is a rescue, not a default. |
| L2 | **Fixed in part.** Upper bounds on `title` and set `title` (500), palette `name` (100), `set.id` and `setId` (200) and `sweeps` (1,000,000), all far above anything the app writes, with tests. Unknown keys and the art pixel size are **accepted residuals** in the PLAN backlog, trigger "sharing puzzles with other people". |
| L3 | **Fixed** (`cd05a54`). Art from a tiny source is scaled up in whole steps to about 160px with smoothing off, so it stays crisp. Test: `artSize scales pixel art up in whole steps to about 160px`. |
| L4 | **Accepted residual** in the backlog, trigger "a quota error on save". |
| L5 | **Fixed.** Reveal says "Nothing left to reveal: a filled square is wrong somewhere." |
| L6, W7 | **Fixed.** The art test stores a record with art and counts it; an exact-boundary test; `play-hint-counter` covers all three restart paths and Continue in Zen; `play-zero-clue` checks the last row and the done style; duplicate assertion removed. |
| L7, W3 | **Fixed.** `createEditHistory` removed; Create uses `createHistory`. Its redo-branch case moved into the game test. |
| W1 | **Fixed.** README rewritten for v1.2, with a "What is stored" paragraph. |
| W4 | **Fixed** (`19f4c00`). The seed adds a puzzle with art; new check `play-solve-reveal` (fade on a fresh solve, strip after it, no fade on reopening). |
| W5, W6, W8 | **Fixed.** PLAN status, the reversed v1 line, lanes table, backlog; test renames; comments. |
| W10 | **Noted only.** Not worth rewriting history. Next lane prompts give one subject style: `v<version> <step> (<lane>): ...`. |
| W11 | **Fixed** (merged `a9ff17f`). The three review docs moved to `docs/reviews/` and the links were updated. `ux-checks.html` stays at the root, since it loads from the server root. |
| D19 | **Done** (owner's request mid-pass). Auto-cross on by default, with crosses sweeping in along the line. New check `play-auto-cross-sweep`. |

**Close checks (2026-10-09, after v1.3 merged):** 188 Node tests and 40 UX checks pass; lint and format clean. Claim grep: no "never stored", "Check mistakes", "Hints switch" or `createEditHistory` left as a current claim. Memory and the toolkit entry updated. **Pass closed.**

## Retrospective

**Owner, 2026-10-09:** "Needed to re-spec more than I expected". Asked whether that came mostly from the reviews or from hands-on use: "mostly hands-on". **Applied:** `/plan-review` check 10 (advisory): for a UI product, put a playable build in the owner's hands right after the core loop works, and size later rounds to one feedback cycle.

**From the record** (owner: "retro ok" to the draft):

1. **A check can pass because of where it runs, not what it tests.** The H1 proof first passed with the fix removed: a hidden pane makes `document.hidden` true, and a plain `http.server` lets the browser reuse old modules. Mutation-verifying the one High caught both. **Applied:** the harness reports the frame as visible (`19f4c00`), and `/ux-gate-review` step 7 now says to prove a fix on a fresh, no-cache origin with the fix removed first.
2. **A shared module's change reached callers the plan said were unchanged (M1).** The lane owned `grid.js`, and nothing listed its other callers. **Applied:** `/plan-review` check 11: a change to shared code names every other caller and what it will see.
3. **Two lanes built the same helper (L7).** The contract gave `canUndo` to no one, so both Create and Play added it. **Applied** in the same check 11: a shared helper gets one owning lane.
4. **A bound was added with a wrong reason (M2).** The orchestrator wrote check 9's bound and justified it with a claim the plan's own D18 contradicted. **Noted only:** a one-off; the comment and D18 are corrected.
5. **Every lane used shell text for test files again** (3 of 3, plus the orchestrator once), despite the rule in each prompt. Contents were checked and clean each time. **Noted only:** the v1.3 lane prompts put the rule in stronger words ("including test files … every lane broke this last round"), and the orchestrator keeps checking lane diffs before merging.
6. **The one data-integrity bug of the release came from the UX pass, not the code lenses** (UX18). **Applied:** `/gate-review` Lens 1 now always asks what happens when new content produces an id that already exists.
7. **Manual checks in a real browser still find what lanes can't** (v1.3, after this pass's fixes): the sticky-gutter offset and the first-layout measurement were both invisible to Node tests and to lanes without a browser. **Noted only:** step 25's manual check on the mobile preset and at 1024x768 is the practice that caught them; keep it in every UI round.

# Pass 4: slim gate on D22, 2026-10-09

**Run:** 2026-10-09. **Scope:** D22, difficulty labels from solver personas: `9438c8e..ba5b1ca`, then the walkthrough fixes `737a007`. Built in the main thread, with no lanes.
**Prior runs:** passes 1 to 3 above. Neither reviewer was shown them.
**Reviewers:** two read-only Explore subagents, cold. The first adversarial run died on a rate limit before reporting. It was rerun after the walkthrough fixes, so it reviewed `ba5b1ca` plus `737a007`.
**Step 0, backlog prune.** Nothing aged. The "revisit after ~5 plays" items still wait on step 13. Color mode gains one item: the personas read run lengths only.

## Lens 1: Adversarial

- **M1 (NEW, Medium). Color puzzles got monochrome personas.** The line techniques assume a gap between runs, but different colors may touch. A two-color 4x4 from a hand-made backup was rated Easy, and `finishes()` checks only that every cell is decided, not that it is right. Create and the samples are black only, so this was reachable only by import.
- **M2 (NEW, Medium). Test gaps.** Deleting the worker line that sets the tier failed no test. `withVerdicts` never saw a tier. The samples test couldn't tell Newcomer from Casual.
- **L1 (NEW, Low). An imported tier wasn't checked against the status.** A needs-guessing puzzle claiming `newcomer` showed Easy. The damage stopped at the label: hearts and hints read only the status.
- **L2 (NEW, Low).** A needs-guessing puzzle saved before D22 shows "Hard" forever, even where Create would now say "Very hard". The duplicate-grid guard blocks re-saving it.
- **L3 (NEW, Low).** The Expert can hold the worker for about 1 to 1.7 s on a 25x25, and tile checks queue behind it.

**Verified clean:**
- **Line techniques:** both are sound in monochrome. An exhaustive probe ran every line of length 1 to 10 with every partial knowledge consistent with its solution, 2.8M calls, and found 0 wrong cells.
- **Termination:** `finishes()` and the Casual loop always end.
- **Expert:** it is sound, ends, and checks its budget before every trial.
- **Main thread:** no main-thread path reaches the Expert.
- **Callers:** every one accepts the new verdict shape. Unknown tiers are rejected. The tier isn't in the id hash, and `PUZZLE_KEYS` is unchanged.

## Lens 2: Outside-reviewer walkthrough

- **W1 (NEW, Medium).** PLAN still described the sweep rule as current in four places: decision 1's list, D2's verdict shape, step 12's "from `verdict.sweeps`", and the Limits table.
- **W2 (NEW, Medium).** PLAN said the worker has solve()'s exact output. It now adds `tier`.
- **W3 (NEW, Medium).** The personas doc's Results section spoke of the replaced rule as "current".
- **W4 (NEW, Medium). The doc's numbers weren't reproducible:** they came from a one-off script outside the repo. `PROBE_BUDGET` and the Very hard tier had no test.
- **W5 (NEW, Medium).** The doc gave each persona a size limit ("Patience") that the code doesn't model.
- **W6 to W11 (NEW, Low):**
  - "Older puzzles get a tier" overclaimed: only line-solvable ones do.
  - The samples ran on the main thread with no comment.
  - The PROBE_BUDGET comment was wrong.
  - Casual had a magic `pass < 4`.
  - Three test names didn't match their assertions.
  - The sample-label claim wasn't pinned.
- **W12 (NEW, Low).** Commit messages: ba5b1ca's body repeats W6, and 3c61f67's subject is jargon.

**What the W4 fix found:** putting the corpus in the repo exposed a real bug. The shipped Newcomer applied overlap only to a fully blank line, so on the column pass it missed full and empty columns. The repo run gave 12 Newcomer puzzles where the one-off script's version gave 48.

## Disposition

| ID | Disposition |
|---|---|
| W4 and the Newcomer bug | **Fixed** (`737a007`). The Newcomer counts overlap on any line, which is sound whatever is already marked. The corpus is the seeded slow test `test/slow/personas.corpus.test.js`, and the doc quotes its output (Newcomer 74, Casual 87, Regular 229, Expert 3, Very hard 1). Sample labels are unchanged. |
| W1, W2, W3, W5, W6 | **Fixed** (`737a007`). PLAN and the doc are reworded; the Patience column is gone. |
| W7 to W11 | **Fixed** (`737a007`). Comments, a loop that runs until a pass adds nothing, the injectable `probeBudget` tested at 0 (gives `guess`), renamed tests, and pinned sample labels. |
| M1 | **Fixed** (gate 4 fix commit). `personaTier` returns no tier when any clue's color isn't 1. **Proof, mutation-verified:** with the guard removed, `a puzzle with more than one color gets no tier` fails; with it, it passes. |
| M2 | **Fixed** (same commit). The worker calls `solveAndRate`, which is tested. `withVerdicts` carries a tier, and the samples test pins tiers as well as labels. |
| L1 | **Fixed** (same commit). `difficultyLabel` ignores a tier that contradicts the status. Test added. |
| L2 | **Accepted**, then **closed by D23** (2026-10-11): both needs-guessing tiers now read "Very hard", so a puzzle without a stored tier shows the same label Create would. |
| L3 | **Accepted.** The Expert runs in the worker, so the page stays responsive, and only needs-guessing grids pay. Trigger: tile checks feel slow. |
| W12 | **Noted only.** Rewording would rewrite history. The later commit bodies carry the reason. |

**Close checks:**
- **Tests:** 200 Node tests pass. The slow corpus test passes. Lint and format are clean.
- **Browser:** the worker returns `expert` for the one-trial 5x5, checked on a fresh no-cache origin. The library labels were checked on 127.0.0.1 in the first build.
- **Claim grep:** PLAN no longer gives "from `verdict.sweeps`" or the sweep thresholds as current.

## Retrospective

**Owner, 2026-10-09:** "Ended up going a lot deeper than originally planned, but seems a very structured approach to start that can be adapted later." **Noted only:** the persona model is a starting structure, not a final answer. Play adjusts it (step 13), and the corpus test makes each adjustment measurable. Next, by the owner's call: broader hands-on feedback from using the tool, not only the difficulty rating step 13 first named.

**From the record** (owner: "apply lesson 1"):

1. **Making a number reproducible found a bug the reviewers didn't.** The one-off script and the shipped code had drifted apart. Moving the script into the repo showed it (12 vs 48), before either lens said anything about the Newcomer. **Applied:** `/gate-review` Lens 2 now always asks, of every number a doc quotes, whether it can be regenerated from code in the repo as it ships.
2. **A "monochrome only" note in a module comment didn't stop a monochrome-only function being called on import data** (M1). The color backlog existed, but nothing enforced it at the call. **Noted only:** this is the trust-boundary shape again (pass 1 H1, pass 3 L2). The guard now lives in the function.
3. **A lens can die mid-run** (rate limit). The rerun came after the walkthrough fixes, so the adversarial lens reviewed the final code. That worked out, but it was luck. **Noted only.**

**Pass closed.**

# Pass 5: slim gate on D23 and D24, 2026-10-11

**Run:** 2026-10-11. **Scope:** `c564583..aad0b57`: D23 (difficulty labels remapped after the owner's first play round, size step, label in the play header, two Easy samples) and D24 (a finished set shows the combined photo; all-filled puzzles start solved). Built in the main thread, with no lanes.
**Prior runs:** passes 1 to 4 above. Neither reviewer was shown them.
**Reviewers:** two read-only Explore subagents, cold.
**Step 0, backlog prune.** Not rerun: pass 4's prune was two days earlier and nothing in the backlog aged since. Two items added (a 4-wide set on a phone; no UX check for the finished-set view).

## Lens 1: Adversarial

- **M1 (NEW, Medium). The set view and Play disagreed on "all filled".** `tileSolved` counted any tile with no blank cells as solved, but Play only pre-fills when every row is one full-width run. A two-color tile like `[[1,2],[1,2]]` (reachable by import) counted as solved unopened, could complete the set, and then opened blank. Cross-lens: Lens 2's W4 found the same.
- **L1 (NEW, Low).** An orphan save (its puzzle record dropped as corrupt) counted its tile as solved, so the gapless mosaic could draw around a "missing" box. Pre-existing count; D24 tied the layout to it.
- **L2 (NEW, Low).** Reopening a pre-D24 save of an all-filled puzzle that had run out of hearts filled it and marked it solved: a loss became a win.
- **L3 (NEW, Low).** After D23, `difficultyLabel`'s early return for needs-guessing made the Expert and guess entries unreachable.
- **L4 (NEW, Low).** A single all-filled puzzle shows "not started" until opened, while the same grid as a set tile counts as solved. Matches D24's intent; undocumented.
- **L5 (NEW, Low).** The view half of D24 (art vs cells vs label, tile box, "complete" text) had no test.

**Verified clean:** Create passes the per-tile size, so the create report, library row and play header agree; the size step matches `largePuzzle` on non-square grids and never moves Hard, Very hard, Not fair or Unchecked; `fillFullPuzzle` handles 0 rows, uniform-color rows and partial grids; a puzzle that starts solved never starts the clock and reads "not started"; `img.src` only gets art that passed the JPEG data-URL and length checks; a null tile id keeps a set incomplete.

## Lens 2: Outside-reviewer walkthrough

All quoted corpus numbers were checked against the code that prints them.

- **W1 (NEW, Medium).** The personas doc said picture-like grids split "roughly evenly" up to 20x20; at 20x20 the Regular leads.
- **W2 (NEW, Medium).** The "contradicting tier is ignored" test's first assertion passed through the new early return, not the check it names (same root as L3).
- **W3 (NEW, Low-Med).** "Same threshold as D20" lived in two constants.
- **W4 (NEW, Low-Med).** Same as M1.
- **W5 (NEW, Low).** Stale: PLAN's status date, the Limits row's "about 5 puzzles", and D22's superseded tag (it missed the no-tier fallback).
- **W6 (NEW, Low).** Some doc numbers weren't printed by the corpus test (per-size fair totals, Very hard, the random-grid claim), the timing line wasn't marked as unseeded, and one Limits line referred to nothing in the repo.
- **W7 (NEW, Low).** The tierless (color) fallback with the size step had no test.
- **W8 (NEW, Low).** `tileBox`'s comment said "the tile's own aspect" but sizes every tile from the first.
- **W9 (Nit).** The sample pin wasn't grouped by label.

## Disposition

| ID | Disposition |
|---|---|
| M1, W4 | **Fixed** (gate 5 fix commit). One rule, `startsSolved` (the starting grid already satisfies the clues), used by the set view; Play uses the same `restartCells`. **Proof, mutation-verified:** with the old flat rule put back, `set tiles count as solved by the same rule Play starts with` fails; with the fix, it passes. |
| L1 | **Fixed** (same commit). A tile needs its puzzle record to count. Tested. |
| L2 | **Fixed** (same commit). A loaded save that is out of hearts isn't filled. Not unit-tested (view code); documented in D24. |
| L3, W2 | **Fixed** (same commit). The early return is gone: a usable tier maps through the table, otherwise needs-guessing falls back to Very hard. The contradiction test now exercises the check (a needs-guessing verdict claiming `newcomer` would read Easy without it). |
| L4 | **Fixed (documented)** in PLAN D24. |
| L5 | **Fixed in part.** The view's choice is the pure `tileFace`, tested. No UX check; backlog item with a trigger. |
| W1, W5, W6, W8, W9 | **Fixed** (same commit). The corpus test prints fair totals, all tiers and all labels per size for blob and noise grids, and marks the timing as wall-clock; the doc quotes those lines. |
| W3 | **Fixed.** `largePuzzle` uses `LARGE_SIDE`. |
| W7 | **Fixed.** Test added. |

**Close checks:**
- **Tests:** 206 Node tests pass. The slow suite passes. Lint and format are clean.
- **Browser:** 40 UX checks pass on a fresh no-cache 127.0.0.1 origin. D23's header checked at 1024x768 (one line, 25x25 still fits) and on the phone preset. D24 checked by hand with a 2x2 test set on a separate 127.0.0.1 origin: 3 of 4 with blank and full tiles counted, the all-filled tile opening solved, and the complete set flush as one photo.
- **Claim grep:** no "Casual is Easy", "Regular is Medium", "keeps Hard", "9 samples" or "three Easy, six Medium" outside the historical D22 entry and passes 1 to 4.

## Retrospective

**Owner, 2026-10-12:** "Interesting so much effort went into level setting tiles and it really didn't entirely match the feel of playing, especially recognizing the human limits of not making mistakes." And: "Interesting what gets flagged out of interacting with the game."

1. **A model of how something feels to a person missed the person.** D22's personas model which techniques a solver knows, and assume it never slips. Real difficulty also comes from mistakes and fatigue, which grow with size; the D23 size step is a stand-in for that. The deep corpus work came before anyone had played a rated puzzle. **Applied** (owner: "yes, apply it"): `/plan-review` check 10 now says a rule meant to match how something feels to a person gets an owner check on a few real examples before deep modeling. The personas doc's Limits names the human-error gap.
2. **Play surfaces what no review asked for.** Round 1 produced the label on the play page, the finished-set photo and the all-filled case; none came from four gates or two UX passes. **Noted only:** it's check 10's lesson again, from the other side; small rounds after hands-on use stay the plan.
3. **From the record: one fact was decided in two places.** D24's "all filled" was written once in Play and once in the set view, with different rules, and both lenses found it. **Noted only:** the existing "problems rhyme" technique covers it; the fix shares one predicate.
4. **From the record: round 1 changed the mapping, not the personas.** The D22 structure absorbed the feedback with a table edit and one rule. **Noted only:** consistent with the owner's pass 4 read ("a very structured approach to start that can be adapted later").

**Pass closed.**

# Pass 6: slim gate on public prep and color research, 2026-10-14

**Run:** 2026-10-14. **Scope:** `ac0dcdb..88e5fc7`: public-prep (MIT license, review docs moved to `docs/reviews/`, import trust hardening, CI, README) and color-research (hidden `?features=color` flag, `research/color/` experiment, `docs/color-research.md`). Both built by Sonnet lanes in parallel worktrees, then merged by the orchestrator. Run before the owner puts her own photos through the color experiment.
**Prior runs:** passes 1 to 5 above. Neither reviewer was shown them.
**Reviewers:** two read-only Explore subagents, cold.
**Step 0, backlog prune.** Nine stale items, all dispositioned as proposed by the owner (`91c0a69`). The color group was re-sorted (left-clear and personas became decisions in `docs/color-research.md`; the `toWebpbn` limit killed as unreachable). The creator and player feel group, pass 1 L11's leftovers and the stray-row note were killed: their trigger ("about 5 puzzles played") fired and three hands-on rounds raised none of them. W2/W8 (PLAN appendix) and pass 1's retro lesson F were killed. W12 was re-deferred to the color UI build. Two fixed now: pass 1 L7 (its trigger fired when public-prep added a solver await to both import handlers) and the Otsu tie pin.

## Lens 1: Adversarial

No Critical or High.

- **L1 (CONTRADICTS pass 3 L2 "done", Medium).** `pickKnown` is shallow: palette entries, the puzzle's `set` and the save's `rules` still carry unknown keys into storage (probe: a 1,000,000-character key survived both import paths, and `idMatches` still passed). The README's "only known fields are kept" and the PLAN backlog's "Done" overclaim. Root: the lane brief itself said "shallow copy".
- **L2 (NEW, Medium).** Re-solving imports has no progress, cap or cancel, and the Import buttons stay enabled. One 25x25 noise grid took 4.7s; a crafted file of many could run for an hour.
- **L3 (REPEAT-OF pass 1 L7, Medium).** Leaving the library mid-import throws on the cleared store and loses the import.
- **L4 (REPEAT-OF pass 1 L7, Medium).** Leaving Play mid-import clears the next view's save hook and navigates the player back.
- **L5 (NEW, Medium).** The research script counts empty or near-empty puzzles as fair (a blank 10x10 is `unique-line-solvable`; `[].every` is true for an empty layer stack). Dark photos under reading (b) would score 100%.
- **L6 (NEW, Low).** Import save drops a picture silently; `artDropped` is computed and tested but unread. Cross-lens with W8.
- **L7 (NEW, Low).** Duplicate ids inside one backup are solved twice and double-counted.
- **L8 (NEW, Low).** `MAX_ART_SIDE` (format.js) and `ART_MAX_SIDE` (create-logic.js) can drift; no test ties them.
- **L9 (NEW, Low).** The solver client is created outside the `try`; a synchronous Worker failure leaves "Checking…" up.
- **L10 (NEW, Low).** Puzzles imported before this change keep their claimed verdicts; only new imports are re-solved.
- **L11 (NEW, Low).** Any `?features=` list with no known names clears every flag, not only `none`. Cross-lens with W9.
- **L12 (NEW, Low).** Research script: preview sheets with the same base name overwrite each other; `research/color/photos` passed as the image folder is counted twice; PNG `tRNS` for color types 0 and 2 and Display-P3 profiles are ignored.
- **L13 (NEW, Low).** Untested glue: the dropped-picture count, a `ratePlan` rejection writing nothing, and Play re-rating only new puzzles.

**Verified clean:** `jpegSize` on progressive frames, fill bytes, truncated and overlong segments, zero sizes and bad base64, and it stops at the first SOF as libjpeg does; Create's art never exceeds 320, so it is never dropped on re-import; the key lists cover every top-level field the app writes; forged ids are removed before planning, a solver failure aborts before any write, and every re-rated verdict passes `validatePuzzle`; `solver-client.js` is behavior-identical to the old Create code; the router keeps encoded ids intact and the flag param cannot throw; CI permissions, lockfile and Node version; the research script is seeded, writes only under `research/color/out/`, and skips unsupported PNGs with a message.

## Lens 2: Outside-reviewer walkthrough

Every data row in `docs/color-research.md` matches a fresh run of `node research/color/run.mjs` byte for byte.

- **W1 (NEW, High).** README said the slow suite took "about 10s" and was "exhaustive 4x4 solver checks". It took about 60s, almost all in the persona corpus. PLAN claimed an exhaustive 5x5 check that was never built. The fast suite's "under 1s" was 1.2s.
- **W2 (REPEAT-OF pass 1 W6, High).** Authorship: PLAN says AI agents wrote the code, the README disclosed AI only for samples, and a hook rejects co-author trailers. Pass 1 rejected the trailer as the owner's rule; going public changes the audience.
- **W3 (NEW, Medium).** The color doc's recommendation says B "matches the photo's colors best" with no photos tested, and "the only approach fair in every run" is not true (gray shades were too; one B variant was not).
- **W4 (NEW, Medium).** The color-error metric favors B by construction: mono is drawn in pure black, so any hue wins.
- **W5 (NEW, Medium).** Percentages from n=6 with no counts beside them; budget-limited `unknown` counts as unfair, which leans against the rejected approaches.
- **W6 (NEW, Medium).** Weak citations: an arXiv paper via a translation mirror, locale-specific links, a 1980 date for median cut (usually cited as 1982), and process notes ("returned 403") in the sources.
- **W7 (NEW, Medium).** Stale "on branch" wording after the merges.
- **W8 (NEW, Medium).** Same as L6.
- **W9 (NEW, Low).** Same as L11, plus the unused `isEnabled` export.
- **W10 (NEW, Low).** Small accuracy points in the color doc ("byte-identical" output includes the elapsed time; "failed" mixes fair and line-solvable; C equals A on two-color samples without saying why).
- **W11 (NEW, Low).** Nothing in the README points to `research/` or the color doc.
- **W12 (NEW, Low).** `difficulty-personas.md` stays at the root after the docs move.
- **W13 (NEW, Low).** About 21 review ids ("gate pass 3, L2") in source comments.
- **W14 (NEW, Low).** Commit timestamps bunched within minutes; mixed body wrapping; one message names a function the next commit renames.
- **W15 (NEW, Low).** No Node or Python version stated; the CI comment implied a pre-commit hook the repo doesn't ship.

## Disposition

Owner, on the findings: "skip medium and lows for now", W1 as below, W2 option (a).

| ID | Disposition |
|---|---|
| L3, L4 | **Fixed** `3b265b1` (as pass 1 L7, during this pass's step 0). **Proof, reproduction:** on unfixed `main` in the browser, leaving the library mid-import raised a TypeError and wrote nothing, and leaving Play mid-import dragged the player back; on the fix, neither happens and a normal import still opens the imported puzzle. `addSamples` got the same guard. |
| W1 | **Fixed** `6b1df67`. Owner: "Persona corpus is an extended test that should not be part of standard CI. Appropriately pare back tests and get suites into target sizes." Three suites: `npm test` (CI, about 0.75s, 224 tests), `test:slow` (solver exhaustive 4x4 plus the 25x25 timing guard, about 11s), `test:extended` (persona corpus, about a minute). **Proof:** all three re-timed after the change; README, PLAN, the personas doc, the corpus test header and the CI comment updated to match (claim grep: no "about 10s" timing claim or 5x5 suite left outside the annotated original plan text). |
| W2 | **Fixed** `d71134a`. Owner chose (a): one README line on how it was built; the hook stays ("trailers not needed"). |
| W7 | **Fixed** `91c0a69` (PLAN and this doc cite merge `a9ff17f`) and `f60438a` (the color doc's header). |
| L1, L2, L6/W8, L7, L8, L9, L11/W9, L13 | First **deferred** to "before the repo is made public"; the owner then asked to "complete the blockers" (2026-10-15). **Fixed**, merge `bd70fc6` (lane `public-blockers`): nested keys picked for palette entries, `set` and `rules` (`f76054c`); "Checking n of N" progress with the toolbar disabled (`a5bf2f5`); Import save says when a picture was dropped (`5bc5f39`); duplicate ids within a backup dropped, first valid wins (`f0b284c`); a test ties the two 320 constants (`f51268d`); the solver client is created inside the `try` (`6fa186f`); only `none` clears flags (`53b63d2`); `droppedArtCount` extracted and the glue tested (`8ddf9d3`). **Checked in the browser** on merged `main`: progress counted 0 to 3 of 3 with all three buttons disabled and re-enabled after, a duplicate puzzle and nested junk keys dropped, verdicts re-solved, and the dropped-picture note shown after Import save. Residual, accepted: a forged-id duplicate placed before a genuine one in the same file drops both (the id check runs after de-duplication). |
| L5, W3, W4, W5, W6, W10, L12 | Same request. **Fixed**, merge `fd759d0` (lane `research-fixes`): degenerate puzzles counted separately and excluded from fair and line (`3e493ca`); counts beside percentages and `unknown` in its own column (`e2fa9e2`); an `A mono-mean` color-error baseline (`a9ae8f0`); unique preview names, the photos folder loaded once, PNG `tRNS` and iCCP and palette warnings (`f8a081d`); tables regenerated and the claims corrected (`f60438a`). **Proof:** every table row in the doc matches a fresh run of the script plus `--detail`. **Result that changed:** most of B's, D's and E's puzzles were fully inked grids with no blank cell, because the blank is pinned to pure white and neither the cream samples nor the synthetic images map to it. B's earlier "fair every time" rested on those. The doc now makes the choice of blank a blocking decision before any color build. |
| W11, W12, W15 | Same request. **Fixed** in merge `bd70fc6`: README points to the color research and states Node 24 and Python 3 (`741c95a`); `difficulty-personas.md` moved to `docs/` (`798648d`). |
| L10 | **Accepted residual.** Only imports made before today, in a personal library, can carry a claimed verdict. |
| W13, W14 | **Noted only.** Review ids are provenance; the history is accurate. |

**Close checks:**
- **Tests:** 224 fast, 3 slow and 1 extended pass. Lint and format clean. After the follow-up lanes (2026-10-15): 234 fast in about 0.4s; the suites were renamed at the owner's request to `test:solver_slow` and `test:difficulty_very_slow` (`7b6cc2a`).
- **Browser:** UX checks 40/40 on both lane branches before the merge, 40/40 on the pass 6 fixes, and 40/40 on `main` after the follow-up lanes; the L7 fix checked before and after on fresh 127.0.0.1 origins.

## Retrospective

**Owner, 2026-10-14 and 10-15:** "the more fine grade division into sub agents seems faster, but creates a number of smaller more isolated but disjointed feeling PRs." On whether that was the split or the reassembly: "disjointed feeling is both. maybe providing a summary when wrapping up would help but not sure." On color: "color run is interesting because I don't feel like there is a great consistent path there like with 2 tone. plan is to test and what feel is like and see if it can be adjusted from there as a cheep effort." The record-based draft was accepted as written.

1. **The brief made the blind spot (L1).** The public-prep brief said "shallow copy", the lane built that, and the orchestrator marked the trust item Done. **Applied:** PLAN "Briefing rules for the orchestrator" and memory `feedback-lane-briefs`: a narrowed brief names what it leaves out, and the backlog marks done only what was done.
2. **A backlog trigger fired inside a lane unnoticed (pass 1 L7).** **Applied:** same two places: grep backlog and gate-doc triggers on a lane's files before briefing it.
3. **Timings are numbers too (W1).** The regenerate-from-code check held for data tables and missed a README timing for two phases. **Applied:** `/gate-review` Lens 2 now says to re-time run-time and size claims.
4. **Many small lanes are fast but feel disjointed, in both the split and the reassembly.** The orchestrator still made four fixes after the two lanes before merging, and the gate found more. **Trial** (owner unsure it helps): after lanes merge, one combined summary of the round, and fewer, theme-sized lanes. Memory `feedback-round-summary`; revisit at the next gate and drop it if it doesn't help.
5. **Color has no obvious consistent path the way two-tone did.** The owner's plan is a cheap feel test first, then adjust; the same lesson as pass 5's check 10. **Noted only:** the research items (L5, W3 to W6, W10, L12) stay deferred until the feel test says the photo numbers will drive a build plan. **Gate pass 7 prune (2026-10-29):** the feel test ran on 2026-10-23 and the owner named no specifics, so the trigger fired without a build plan. Re-deferred with a new trigger: the owner names what is still wrong with photo colors (`FUTURE-WORK.md`, item 4).

**Pass closed.**

# Pass 7: slim gate on the e2e pipeline checks, 2026-10-29

**Run:** 2026-10-29. **Scope:** `772868d..e5efbb6` on local `main` (unpushed): the four end-to-end UX checks (`test/ux/pipeline-*.js`), the harness helpers, `test/ux/expected-verdict.js`, the color fixture, the `e2e-pipeline-*` FEATURES rows, and how the docs describe them. The view-split plan is not in this slice.
**Prior runs:** passes 1 to 6 above. Neither reviewer was shown them.
**Reviewers:** two read-only Explore subagents, cold. Rubric L1 1/2/1/2, L2 2/1/2/2. **Owner override:** none.
**Step 0, backlog prune.** Six items, all applied as proposed (`9bb85ba`), with one correction: "kill as done" for the harness item was only half true (the save-file round trip was not built), so it is marked mostly done with that part left open.
**Before the lenses:** the four lanes' own mutation proofs (Wave 2) had already found and fixed three weak checks (webpbn image rows, a plausible constant worker verdict, a two-tone "color" puzzle in the backup check); see `docs/plans/e2e-pipeline-checks.md`.

## Lens 1: Adversarial

- **L1-1 (High, NEW).** `verify` for the pipeline rows was `npm run test:ux`, which exits 0 when nothing fails and at least one check passes. **Probe:** with `PIPELINE_CHECKS` emptied, the runner printed "45 pass, 0 fail" and exited 0, so deleting a check left every row `passing`.
- **L1-2 (Medium, NEW).** The color check accepted any 3 to 5 colors, so a Colors option that was ignored passed.
- **L1-3 (Medium, NEW).** The backup check compared only the verdict after import, so a lost `blank`, title or art passed (the id hashes only grid, palette hex and set).
- **L1-4 (Medium, NEW).** Nothing tied the saved grid to the uploaded image; an inverted or constant converter passed on self-consistency.
- **L1-5 (Medium, NEW).** The expected verdict compared status and sweeps only; a dropped `tier` passed.
- **L1-6 (Medium, NEW).** `createAndSave` matched the "Open it" link of a refused duplicate save, so it could return an old id without saving; its docstring said the opposite. Masked today by `resetStore`.
- **L1-7 (Low, NEW).** `resetStore` wipes the seeded puzzles; safe only because the pipeline checks are last in `CHECKS`.
- **L1-8 (Low, NEW).** Two grid waits in the helpers were vacuous (the grid exists before the upload).
- **L1-9 (Low, NEW).** Timeouts are generous (15s/20s) with a clean failure; `DataTransfer` is Chromium-only.

**Verified clean:** stub restore in `captureDownload` on the right window and on the throw path; `setFile` uses the frame's own constructors; no Save-enabled race after a Colors change; the tamper step always changes the verdict and asserts exactly 2 records; webpbn expected clues and picture are derived in the check, not from `webpbn.js`; ids unique, no `known` flags; the page refuses non-127.0.0.1 hosts.

## Lens 2: Outside-reviewer walkthrough

- **W1 (High, NEW).** Four rows' evidence said "verified at `4707b09`", a commit that contained none of the checks, stamped with a dirty tree; `PROGRESS.md` repeated it.
- **W2 (High, REPEAT-OF-pass-6 W1).** README quoted "about 8s" for `test:ux` twice; measured 11.5s. The docs-claims test's 1.5x band hides it.
- **W3 (Medium, NEW).** README's UX-check paragraph did not mention the end-to-end checks.
- **W4 (Medium, NEW).** `view-split.md` quoted "the 45 UX checks".
- **W5 (Medium, NEW).** `test/ux/pipeline.js` kept a lane-workflow template comment; the plan claimed a guard the code lacks.
- **W6 (Medium, NEW).** The plan's original Wave 2 table and the webpbn row still said "dimensions"; the export writes none.
- **W7 (Medium, NEW).** `docs/plans/` is outside the public-docs scan (`^docs/[^/]+\.md$`) and carries orchestration wording.
- **W8 (Low, NEW).** Three different timings for one suite across the repo.
- **W9 (Low, NEW).** Merge ladder and a fixup commit in the history; no action needed.
- **W10 (Low, NEW).** `FUTURE-WORK.md` and `docs/plans/` not linked from README or AGENTS.
- **W11 (Low, NEW).** AGENTS and PLAN mention tooling not in the repo (user-level skills, harness-kit).

**Verified clean:** 49 pass / 450 then 452 tests / 20 of 20 features, re-run; no private paths or owner references; check names match their assertions; plan helper signatures match the code; the left-out save-file item is stated honestly.

## Disposition

| Finding | Disposition |
|---|---|
| L1-1 (High) | **Fixed** `70f96ce`. `test/ux_registry.test.js` (fast suite) pins the four ids, unique ids and no `known`; chained into the four rows' `verify`. **Proof, mutation-verified guard:** with the registry emptied, the old runner exits 0 with 45 pass and the new test fails ("check pipeline-mono-upload-to-library is not in CHECKS"). |
| W1 (High) | **Fixed** `e5efbb6`. `features.py restamp` at a clean HEAD (all 20 rows at `70f96ce`); `PROGRESS.md` regenerated. **Proof:** `features.py check` ok and every row's evidence names a commit that contains its check. |
| W2 (High) | **Fixed** `70f96ce` for the value (README 11s, recorded baseline 11, measured 11.5s). **Accepted residual:** the 1.5x tolerance still passes a README that says 8s against 11 (8 is above 11/1.5). Tightening it would flake on slower machines; the real control is re-timing when a suite gains checks (retrospective lesson 2). |
| L1-2 | **Fixed** `70f96ce`: asserts exactly 4 colors. **Mutation:** Colors forced to 3, check fails "asked for 4 colors in total, got 3". |
| L1-3 | **Fixed** `70f96ce`: whole record minus verdict compared across the round trip. **Mutation:** `blank` removed from `PUZZLE_KEYS`, check fails. |
| L1-4 | **Fixed** `70f96ce`: the cat picture is pinned as a golden. **Mutation:** inverted `binarize`, check fails. Color regions followed at the owner's request in `df341c2`: every cell wholly inside a fixture rectangle must be the nearest ink to that rectangle's color and every cell clear of them blank, so palette tuning does not break it. **Mutations**, each failing only the color check: inks 1 and 2 swapped, the picture shifted one column, ink 3 absorbed into the blank. |
| L1-5 | **Fixed** `70f96ce`: full verdict compared, expected value built without `verdictOf`. First attempt was circular (the mutation passed); caught by running it, then fixed. **Mutation:** `tier` dropped from `verdictOf`, two checks fail. |
| L1-6 | **Fixed** `70f96ce`: `createAndSave` throws unless the message reads "Saved.". **Proof:** a throwaway check saving the same image twice got "was not saved". |
| L1-7, L1-8 | **Fixed** `70f96ce`: ordering requirement written in `pipeline.js`; vacuous waits removed. |
| L1-9 | **Noted only.** Large margin; CI is headless Chrome. |
| W3, W4, W5, W6, W8, W10 | **Fixed** `70f96ce` (README, view-split, `pipeline.js` header, plan table and row wording, AGENTS links). |
| W7 | **Fixed** `70f96ce`: the public-docs scan now covers `docs/plans/`. The process wording stays; PLAN.md is the same kind of record. |
| W9, W11 | **Noted only.** History is accurate; the out-of-repo tooling is explained in AGENTS. |

**Close checks:** 452 tests, lint, format and typecheck clean, 49 of 49 UX checks, `features.py check` ok after restamp. Nothing pushed.

## Retrospective

**Owner, 2026-10-29:** "despite clear splitting of ideas into 2 projects, and explicitly asking for planning and execution to be split, the managing agent kept trying to scope creep in the second project multiple times. Hell did that in this response too which is the 3rd time I said to wait."

**Owner decision, 2026-10-29:** the documented `test:ux` time is about 10s, to be monitored at that level (README and `RECORDED_SECONDS` both say 10; measured 11.5s).

1. **The orchestrator kept pulling the second project into the first project's work (owner).** It offered to start it, listed it as next and named it in closing messages after being told to wait, three times. **Applied:** the feedback memory `feedback-no-cross-project-scope-creep` and a PLAN briefing rule ("Stay inside the project the owner named").
2. **A shared helper's defaults leaked into a lane's check.** Lane C's "color" puzzle was two-tone. **Applied:** PLAN briefing rule (list the defaults a helper does not override; each check asserts the property its name claims). The backup check now asserts at least 2 inks.
3. **A timing lesson from pass 6 recurred (README "about 8s", measured 11.5s).** The lesson had gone into the skill text and the 1.5x band still hid it. **Applied:** the owner set 10s; PLAN lane rule: update `RECORDED_SECONDS` in the commit that adds checks. **Noted only:** the tolerance band stays, since tightening it flakes on slower machines.
4. **A verify command could not notice its own check being deleted (L1-1).** **Applied:** AGENTS rule 10 and `test/ux_registry.test.js`. The same-shape sweep found no other row: the only other rows on plain `npm run test:ux` are the runner's own row and the helpers row, which has no checks.
5. **Mutation runs found more than the review did, and a first fix was circular.** **Applied:** PLAN rule: a check fix is not done until its mutation has failed it.
6. **Lane evidence is stamped before the commit.** **Applied:** PLAN lane rule: run `restamp` after the merges. Done for this round (`0cbe3a0`).
7. **A shared registry conflicted on every lane merge.** **Applied:** PLAN rule: the foundation lane pre-registers stubs.
8. **Leftover lane worktrees under `.claude/` fail the repo scans, and Windows refuses to delete the folder.** **Deferred.** Trigger: the next multi-lane round; make the scans skip `.claude/` then.
9. **The two process trials fired at this gate (feature rows per committed piece; one combined round summary).** The owner did not rule on either. **Noted only:** the evidence is mixed (the rows gave a visible ledger per lane, but their evidence was stale until restamped). Both trials continue to the next gate.

**Pass closed.**

# Pass 8: slim gate on the view split, 2026-10-29

**Run:** 2026-10-29 · **Scope:** commits `d670153..` (the Create and Play views split into folders, the storage and size lint rules, one new UX check; plan in `docs/plans/view-split.md`), local `main`, unpushed. The e2e round (pass 7) was gated and pushed separately.
**Prior runs:** passes 1 to 7 above. Both lenses were read-only Explore agents and read the code cold (no prior review records, no plan documents until their own findings were written).
**Rubric (trial):** L1 2/1/2/2, L2 2/1/2/2. Fix durability is 1 on both: most proposed fixes were a rule or a test, but the typing and scaffolding items were prose.
**Owner override:** none.
**Step 0:** backlog sweep run first (`event sweep backlog-prune`): two items closed as done (the save-file round trip, `050fd12`; the storage lint rule), no stale item found.

## Lens 1: Adversarial

No Critical or High. The lens diffed both views line by line against `d670153` and found no behavior difference from the move.

- **L1-1 (NEW, Medium).** Leaving a puzzle was unguarded: deleting `persistNow = ctx.persist.persist`, deleting the `persistNow()` call in `unmount`, or removing the final clock tick all passed every test. Also unguarded: create's draft fields (dropping `baseline`, `history`, `titleTouched`, `savedSig`, `image` or `title` from the draft), `solver.terminate()`, the keydown removal, the resize cleanup, the `live()` aborts in the import handler.
- **L1-2 (NEW, Medium).** Cross-module calls are untyped: `ctx.rulesLayout.pickBrushX(digit)` passes `tsc`, because the module slots resolve to `any` (play by declaration, create probably through a circular type). Control cases (`state.imagee`, `ctx.shell.showErrorX`) are caught.
- **L1-3 (NEW, Medium).** The storage rule was bypassed by `self.localStorage`, an alias of `window`, `top.`, `parent.`, `document.defaultView.localStorage`, `this.localStorage`, a computed key and `Reflect.get(window, ...)`.
- **L1-4 (NEW, Medium).** Both layout tests passed when a wiring line was only a comment (`// ctx.session = createSession(ctx);`).
- **L1-5 (NEW, Low).** Lint coverage narrower than the claim: `files: ['src/**/*.js']` skipped `.mjs` and `.cjs`; widening the store override to `src/**/store.js`, or adding `skipBlankLines`, passed the tests.
- **L1-6 (NEW, Low).** Scaffolding left behind: unread context members (`cleanup`, `container`, three shell functions), unused return members, double initialisation in both `state` objects, stale comments.
- **L1-7 (NEW, Low).** `save.js` `artFor` shadowed the factory's `ctx` with the canvas context (correct today, a trap for the next edit).
- **L1-8 (NEW, Low).** The new save-file check does not exercise the `pendingNotes` note, the solver-failure branch, the storage-write failure or the `live()` aborts.
- **L1-9 (NEW, Medium, pre-existing, not part of the move).** The always-ask question about content-derived ids: `saveSingle` refuses to overwrite an existing id, `saveSet` has no such guard (its rollback code shows ids can collide). Read from the code, not reproduced.
- **L1-11 (NEW, Low).** The fast-suite timing test failed once on a cold run (3.1s against "under 1s", band 3x) and passed warm.

Checked and correct: build order and DOM, setup order in `mount`, cleanup push order and `unmount` order, `persistNow`/`generation`/`pendingNotes` in the import path, live reads of `history`, `drag`, `cells`, the draft and teardown order in create, listener equivalence, `save.js` verbatim including the never-overwrite check in `saveSingle`.

## Lens 2: Outside-reviewer walkthrough

No High.

- **L2-1 (NEW, Medium).** Stale "until the session module owns it" comments and a cast to `any` in `hud.js`, `context.js` and `index.js`, after the session module had taken them over.
- **L2-2 (NEW, Medium).** Play's `PlayContext` is much looser than create's (`any` slots; 33 `any` hits across both views): documentation, not enforcement. Same cause as L1-2.
- **L2-3 (CONTRADICTS pass 7 W8, Medium).** README quoted `test:ux` as "about 10s" in the table and "about 8s" in the paragraph; AGENTS and README gave `solver_slow` as 10s and 11s. Pass 7 fixed the line it cited and the 1.5x band hid the rest.
- **L2-4 (NEW, Low).** AGENTS said D1 to D24; PLAN has D29. The line was edited in this round.
- **L2-5 (NEW, Low).** README said four `pipeline-*` checks; there were five (now six). No README text on the new folders.
- **L2-6 (NEW, Low).** Plan jargon ("Wave 2", "step 1c") in source and test comments.
- **L2-7 (NEW, Low).** The plan fixed play's call-site count (47, not 48) but not create's (56, not 57).
- **L2-8 (NEW, Low).** One commit (`5c56afb`) mixes the cap, its test, an AGENTS edit and the Results write-up.
- **L2-9 (NEW, Medium).** The layout tests prove file existence and export names, not that extraction happened: an empty factory returning `{}` passes both.
- **L2-10 (NEW, Low).** The `split-*` feature rows cite the plan file but no section.
- **L2-11 (NEW, Low).** The byte-identical page comparisons in the Results section ran in the browser pane and cannot be regenerated from the repo; crop-box drag was never run.

Checked and fine: test, UX and feature counts; line counts; no `void ctx`, `@ts-`, `eslint-disable` or `TODO` in `src`; no stale references to the old paths; the lint tests assert what their titles say; the verify commands fail when their subject is deleted; the plan's rejected alternatives are substantive.

## Disposition

| Finding | Disposition |
|---|---|
| L1-1 | **Fixed in part** (`b753cc7`, merged `bfd462a`): `pipeline-leave-puzzle-saves-time`, feature row `leave-saves-time-ux-check`. **Proof: mutation-verified guard.** Deleting `persistNow = ctx.persist.persist` and deleting the `persistNow()` call in `unmount` each fail it. **Accepted residual:** removing the final clock tick, or running `persistNow()` before the cleanup, is not caught, because the 500 ms interval already banks time in memory and the final tick adds under 500 ms; a check tight enough to see it would be flaky. **Deferred:** create's draft fields, `solver.terminate()`, the keydown and resize cleanups, the import handler's `live()` aborts. Trigger: the next change to create's `teardown`/draft or to play's import handler. Recorded in `PLAN.md`. |
| L1-2, L2-2 | **Deferred.** The slots resolve to `any` through a circular type reference (a module's factory takes the context that holds its own slot). The cure is explicit per-module API typedefs, a larger change. Trigger: the first time a module method is renamed, or the 300-line plan, whichever comes first. The `any` cast in `hud.js` was removed (L2-1, `70a6704`). |
| L1-3 | **Fixed** `70a6704`: a `no-restricted-syntax` selector flags any `.localStorage`/`.sessionStorage` property or computed string key under `src`. **Proof: mutation-verified guard.** Removing the selector fails 4 tests in `test/lint_rules.test.js`. **Accepted residual:** a computed key built at run time and `Reflect.get` still get through; the rule guards against accidents, not an attacker (comment in `eslint.config.js`). |
| L1-4, L2-9 | **Fixed** `70a6704`: both layout tests strip comments, and each module's functions must be defined in the module and not in `index.js`. **Proof: mutation-verified guard.** A commented-out wiring line, an emptied `report.js` and an emptied `hud.js` each fail the layout tests. `onKeydown` stays in `index.js` as a delegating wrapper and the test pins that. |
| L1-5 | **Fixed** `70a6704`: glob widened to `.js/.mjs/.cjs`; tests pin `src/views/store.js` (not the storage module), blank lines, `.mjs` and `src/views/library.js`. **Proof:** the `skipBlankLines`, store-glob and glob mutations each fail a test. **Accepted residual:** an `ignores` entry for a path none of the tests probe. |
| L1-6 | **Fixed** `70a6704`: dead context members and typedef lines removed. **Accepted residual:** unused return members of a few factories, and the double initialisation of `state` fields (kept deliberately, each mirrors the original declaration site). |
| L1-7 | **Fixed** `70a6704`: renamed to `g`. |
| L1-8 | **Deferred.** Trigger: the next change to play's import handler. |
| L1-9 | **Deferred, needs confirming first.** Not part of the move. Backlog entry in `PLAN.md`; trigger: the next change to `saveSet`, or a set tile that matches a saved puzzle. |
| L1-11 | **Noted only.** The 3x band passed on every warm run; trigger: it fails in CI. |
| L2-1 | **Fixed** `70a6704`. |
| L2-3 | **Fixed** `285e1ae` for the values (README test:ux 10s in both places, solver_slow 8s in README, AGENTS and PLAN). **Proof: mutation-verified guard.** A new test, "every doc quotes the same time for one suite", fails when README says 8s in one place and 10s in another (it also found PLAN at 11s). This is the structural fix pass 7 W2 left as a residual. |
| L2-4, L2-5, L2-7 | **Fixed** `285e1ae`. |
| L2-6 | **Fixed** `70a6704`. |
| L2-8, L2-10 | **Noted only.** The merge structure is readable; the rows cite the plan file. |
| L2-11 | **Accepted residual.** Recorded in the plan's Results as manual checks; crop-box drag is still owed in a real browser. Trigger: the next structural refactor scripts the comparison as a UX check. |

**Measured after the fixes:** `test:ux` 11.8s and 12.2s for 51 checks (documented about 10s by the owner's 2026-10-29 decision, band 1.5x); full check 4.7s; `test:solver_slow` 8.3s; 518 fast tests; 26 of 26 feature rows passing.

## Retrospective (pass 8)

### The owner's lessons (her words)

- **Surprise:** "skip / ignore plan guidance -> implement checks to require". Earlier note: "Sounds like not engaging with the existing plan review was the biggest problem."
- **Took longer:** "gaps that more structured planning cycle should have handled, worktree folder failures in executing waves".
- **Worked:** "Mutation proofs seemed to pull weight."
- Not answered: what to do differently at the start of the next round, and where the assistant got in the way.

| Lesson | Disposition |
|---|---|
| Plan guidance was skipped, so require it | **Applied.** `features.py` plan gate (`plan_gate`, `plan-reviewed`, `plan-gate`, `activate --skip-plan-review`) in the harness kit with 14 tests, six mutations caught; on in new scaffolds (template ledger and AGENTS rule); on in nonogram, `93cee01` (26 rows marked as predating it, AGENTS rule 11); workspace `CLAUDE.md`; `/plan-review` skill "Record the run"; memory `feedback-run-plan-review-before-lanes`. **Deferred:** repos that carry their own `features.py` (jscc and others); trigger: the next work in each. |
| Structured planning should have handled the gaps | **Applied.** `/plan-review` checklist items 14 to 18: equivalence proof and a mutation audit before a "no behavior change" plan starts, hunk-level lane disjointness, setup and teardown order for closure extractions, pricing "mechanical" claims, and the lane brief template. |
| Worktree folder failures during waves | **Applied** `999eb79`: `.claude/worktrees/` is ignored by eslint, prettier, git and the public-docs scan. **Proof: mutation-verified guard.** With a fake worktree holding a lint error, badly formatted code and a private path, lint, format and the scan pass; removing the scan's skip makes it fail. |
| Mutation proofs pulled their weight | **Applied (kept and made standard).** Named in plan-review items 14 and 18 and in every lane brief; they found about 20 coverage gaps and caught the wrong-order and stale-state mistakes in the briefs. |
| A mutation sweep before the move would have shown the thin safety net early | **Applied** in plan-review item 14. |
| Briefs carried ordering errors the lanes caught | **Applied** in plan-review items 16 and 18. |
| Every Wave 2 merge needed hand-resolved conflicts in `index.js` | **Applied** in plan-review item 15. **Deferred:** the delegating-wrapper design itself, to the next plan that restructures code. |
| A timing lesson from pass 7 came back because the tolerance band hid the drift | **Applied** `285e1ae`: a test that every doc quotes one time per suite. |
| The first lint tests probed only the cases the author thought of | **Applied** to this rule (`70a6704`, bypass probes and store-glob, blank-line and glob mutations). **Noted only** as general practice: rule tests carry a list of bypass attempts. |
| Lane start and finish by hand, no pure-move verifier, free-text maps and gap lists | **Deferred.** Candidates for the harness kit (`lane-start` and `lane-finish`, a moved-lines verifier, machine-readable maps, a gap ledger). Trigger: the next multi-lane round. |
| The gate lenses were interrupted by a usage limit and re-run | **Noted only.** Nothing to change; the second run was complete. |

**Pass 8 closed 2026-10-29.** Nothing is pushed.
