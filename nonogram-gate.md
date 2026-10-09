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
| L7 | **Deferred.** Trigger: any error report from navigating during an import, or the next time those handlers are touched. Fix shape: a per-mount generation token, checked after each await. Real but needs a mid-read navigation, and the worst case is a console error or a leaked listener, not data loss. |
| L8 | **Fixed** `bc3d580`. Control characters are dropped before escaping (test added). |
| L9 | **Noted only.** It matches how auto-cross works in other games: it reasons from the clues, not the answer. Auto-cross is off by default, and Check exists for this. |
| L10 | Bitmask part **fixed** by the palette cap in `6fca7ac`. 25x25 timing at the real budget is **fixed** in `efecb74` (nine seeded noise grids at `DEFAULT_BUDGET`, each under 1s). Structured worst cases stay under the "Limits" table item until real 25x25 puzzles exist. |
| L11 | `e.key` **fixed** in `6fca7ac`. The rest are **noted only**, since they're minor UX for a single-user tool. Elapsed-time-on-close and leave-Create-warning join the backlog's "after about 5 puzzles played" trigger. |
| Weak tests | Smoke test **deleted**. Three tests **renamed** to say what they assert (`efecb74`). Noise timing **replaced** with a real-budget test. The Otsu tie pin and the create stale-race test are **deferred**: the race is guarded in code (verified clean above), and testing it needs DOM wiring this repo doesn't unit-test. |
| W1 | **Fixed** `efecb74`. README added with what it is, how to run it, the routes, dev commands and doc pointers. |
| W2 | **Partly fixed.** The status line is now an as-built summary. Moving the lane machinery to an appendix is **deferred** until the next plan edit. It's an accurate record of how this was built, just long. |
| W3 | **Fixed** `bc3d580`. Demo route removed. Samples cover the use. |
| W4 | **Fixed** `efecb74` (the backlog committed). |
| W5 | **Fixed** `6fca7ac`. Q6 and step 10 now state the as-built rule. |
| W6 | **Rejected.** The owner's standing rule is no AI co-author trailer in their personal repos, and the commit hook enforces it. The session's default convention doesn't override the owner's instruction. |
| W7 | **Fixed** `6fca7ac` (no hard-coded count) and `efecb74` (the test now matches its description). |
| W8 | **Deferred** with W2, to the next plan edit. |
| W9 to W11 | **Fixed** `efecb74`. |
| W12 | **Deferred.** Trigger: the next change touching two or more views. Extract `src/views/dom.js`, a shared download helper, and one CSS-loading convention then. Duplication beats premature reuse until a change has to touch all copies. |
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
- **F** (how it extends and ages): *deferred.* Trigger: the first change after v1, whether color mode or a backlog item. Check then whether the frozen contracts and tests made the change easy or got in the way.

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
| W11 | **Deferred.** Trigger: before the repo is made public, move the review docs to `docs/reviews/` and update the links. |
| D19 | **Done** (owner's request mid-pass). Auto-cross on by default, with crosses sweeping in along the line. New check `play-auto-cross-sweep`. |

**Close checks:** see the Retrospective's close line below once it is filled.

## Retrospective (draft from the record; the owner's lessons still to come)

1. **A check can pass because of where it runs, not what it tests.** The H1 proof first passed with the fix removed: a hidden pane makes `document.hidden` true, and a plain `http.server` lets the browser reuse old modules. Mutation-verifying the one High caught both. *Proposed: applied* (harness forces visible; note added to `/ux-gate-review`'s step 7 to run UX checks on a fresh, no-cache origin when proving a fix).
2. **A shared module's change reached callers the plan said were unchanged (M1).** The lane owned `grid.js`, and nothing listed its other callers. *Proposed: applied* as a `/plan-review` check: a change to a shared module names every caller and says what each one sees.
3. **Two lanes built the same helper (L7).** The contract gave `canUndo` to no one, so both Create and Play added it. *Proposed: noted*, folded into lesson 2's check (shared helpers get one owner).
4. **A bound was added with a wrong reason (M2).** The orchestrator wrote check 9's bound and justified it with a claim the plan's own D18 contradicted. *Proposed: noted only.*
5. **Every lane used shell text for test files again** (3 of 3, plus the orchestrator once), despite the rule in each prompt. Contents were checked and clean each time. *Proposed: noted only; ask the owner whether to keep the rule for lanes or accept it with a diff check.*
6. **The one data-integrity bug of the release came from the UX pass, not the code lenses** (UX18: saving a grid that matches an existing puzzle silently renames it, because the id is a content hash). *Proposed: applied* as a Lens 1 prompt item in `/gate-review`: for content-addressed ids, check what happens when new content hashes to an existing record.
