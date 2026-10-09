# Nonogram Studio: UX reviews

# UX pass 1, 2026-10-08

**Scope:** `main` at `292d414` (v1.1 after gate pass 2, before D11 to D13). Themes: evening, day and auto. Widths: desktop (1024x768) and the mobile preset (375x812). Data: on `localhost` only four "AI test sample" puzzles were played, then restarted. The empty state, first run and Create were done on `127.0.0.1`, which has its own storage.
**Reviewer:** one read-only subagent (Opus) following `/ux-gate-review`. It hadn't seen the code or the plan before its cold walkthrough. The orchestrator re-confirmed the Blocker through the UX checks below.
**Core tasks walked:** find and start a puzzle; play with mistakes; undo; run out of hearts and recover; finish (hearts, and Zen); Zen and hints; Create from an image (the sample PNGs, injected into the page's file input) and from Blank grid; save; print with and without the key; Load samples and the empty library.

**Changed since this pass (D11 to D13, merged after the review):** Check mistakes is gone, because Zen now marks wrong fills at the square. Clue numbers cross out on completion. Leaving Zen restarts the puzzle. The mentions of Check mistakes in UX11 and in the accessibility notes refer to the build that was reviewed.

## Findings

### Blocker
- **UX1. Blank grid can't be drawn on.** With no image loaded (first load, or after Blank grid), the whole 15x15 grid renders as a 28px square, with cells about 3px wide. Cause: `.nng-create-grid-wrap` shrinks as a flex child when the crop panel is absent. "Draw from blank" is one of the two promised ways to make a puzzle. **Recommend:** 1. Size the grid wrap to its cells (`flex: none` or a min width), and show a "drop an image or start blank" line when empty. *(Confirmed by `create-blank-grid-usable`: cells measure 3.0px.)*

### Major
- **UX2. Leaving Create loses unsaved work without warning.** A nav click drops the image and hand edits. The editor already confirms before a threshold change discards edits. **Recommend:** 1. Keep the draft across route changes and restore it. 2. Confirm on leaving, plus `beforeunload`.
- **UX3. How to play is never shown.** Nothing on screen explains left-drag to fill, right-drag to cross, or Ctrl+Z, and there's no Undo button. **Recommend:** 1. Undo and Redo buttons with their shortcuts, plus a one-line legend under the grid. 2. A first-run tip.
- **UX4. Losing all hearts costs the whole game. *Plan-sourced: D7.*** On a 20x20 a full row of correct work was lost, and the panel doesn't say what Restart clears or that Zen exists. **Recommend:** 1. Add "Continue in Zen mode", which keeps the cells, and say what Restart clears. 2. Scale hearts with grid size. 3. Keep it and accept it in writing.
- **UX5. Mistake and solve feedback lands away from the eye.** Hearts are a small glyph above the grid, which is off-screen while playing the lower rows of a 20x20 or 25x25. The red cross fades on the next move. "Solved" offers no next step. The stroke count sits by the timer, not the cursor (plan step 7). The out-of-hearts panel pushes the grid down about 48px. **Recommend:** 1. A status strip at the grid (hearts, count, Solved with "Back to library"), and an out-of-hearts overlay instead of a panel. 2. A sticky header.
- **UX6. Theme can't be reached at narrow width.** At 375px the nav is about 505px wide, and the Theme button is off-screen with no scroll. **Recommend:** 1. Let the nav wrap, or show an icon button at narrow widths. 2. Move Theme into a footer.

### Minor
- **UX7.** The library is ordered by internal id, which reads as random. **Recommend:** 1. Recent or in-progress first. 2. A sort control.
- **UX8.** Delete has the same weight as Play, right next to it, and on mobile it wraps under Play. **Recommend:** 1. Make Play primary and put the rest in a "…" menu. 2. Style Delete as a danger button and set it apart.
- **UX9.** Developer vocabulary: "AI test sample:", "Export webpbn XML" on every row, "Export save / Import save" with the same weight as Restart, both "Not fair" and "not fair", and an ambiguous "new". **Recommend:** 1. Plain names, a More menu, "Not started", one fairness label.
- **UX10.** Hints is a switch that only unlocks a button, and Reveal picks the least useful cells (empties, in reading order). **Recommend:** 1. Drop the switch and reveal a filled cell, or a cell in the line nearest to solved. 2. Keep the switch, add a tooltip, and reveal at random.
- **UX11.** The rule switches (Zen, Hints) are saved per puzzle, which is surprising. **Recommend:** 1. Global defaults, with a per-puzzle override shown as one. 2. Label them "(this puzzle)".
- **UX12. *Plan-sourced: step 10's `defaultSize`.*** 20x20 pixel-art sources open at 15x15 and lose detail. The title stays "Untitled". On an empty grid the report praises it ("Easy") and Save is enabled. **Recommend:** 1. Use the native size when the source matches a preset, take the title from the file name, and disable Save and the report until something is filled.
- **UX13.** Create has no undo for hand edits. **Recommend:** 1. Reuse the player's undo stack.
- **UX14.** A restarted puzzle that has only its automatic crosses reads "in progress". **Recommend:** 1. Treat a save equal to the starting grid, with no time, as not started.
- **UX15.** 20x20 and 25x25 run past a 768px-high window, so the controls scroll away. At 375px the clues scroll away from the cells. **Recommend:** 1. Fit cell size to the viewport. 2. Sticky clue gutters.

### Polish
- **UX16.** Empty lines show no "0". The theme switch flashes unreadable for about half a second. The hover crosshair stays on a solved or locked grid. "Theme: auto" doesn't say what it resolved to. The file input is unstyled in evening. Two Restart buttons show when out of hearts.

### Taste
- **UX17.** In evening, the amber fill and the amber hover crosshair are close in hue. A deeper fill might read faster at 25x25.

## Accessibility basics (not an audit)
- The play and Create grids aren't keyboard operable. This is known: the plan left a keyboard cursor out of v1.
- Focus rings are visible. Measured contrast passes 4.5:1 in both themes.
- Two Create dropdowns share one "Tiles" label, so the second is announced only as "1". Delete buttons don't name their puzzle. Grid targets are 18 to 24px.

## What works
Drag to fill and right-drag to cross feel right, and pre-crossed empty lines are a nice touch. The out-of-hearts state is unambiguous. The Restart confirm copy is specific. Create from an image is genuinely good: instant, side by side, with a live report and a discard-edits guard. After saving, "Saved. Play it · Library" gives clear next steps. Load samples de-duplicates and says so. The empty library offers three ways forward. Print is clean, with the key hidden until ticked. Both themes deliver the planned cozy look, and both are legible.

## Not checked
A real print to paper. Export, Import and webpbn downloads. Whether Delete confirms (not pressed on `localhost`). Tile set creation, and the owner's "Tile test" mosaic, where tile 1,2 shows neither picture nor label, possibly a solved blank tile. Touch, screen readers, reduced motion. A library of 100+ items.

## UX checks added from this pass
`ux-checks.html` (with `test/ux/`) replays the reviewer's walkthrough against the running app on `127.0.0.1`. **First run, after D11 to D13:** 14 pass, and 10 KNOWN fail for the reasons above: UX1, UX2, UX3 (twice), UX5, UX6, UX10, UX12, UX14, and the shared Tiles label. Two KNOWN checks first passed when they shouldn't have, one through a timing race and one through a too-loose label test. Both were tightened until they failed for the reason the reviewer saw.

## Disposition
Owner's calls (2026-10-08): "1, 2a, 3, 4a, 6, minors as recommended. On 5 when complete fade to original image crop including original color palette. Back to library strip below the image appears once fade is complete." Then "1, add a hint counter per puzzle, do polish items too if they are easy". Built as v1.2 (PLAN.md steps 19a to 22).

| Finding | Disposition |
|---|---|
| UX1 | **Fixed** (19a). |
| UX2 | **Fixed** (19d), option 2a: the draft survives navigation; `beforeunload` warns. |
| UX3 | **Fixed** (20a). |
| UX4 | **Fixed** (20b), option 4a: Continue in Zen mode. |
| UX5 | **Replaced** by the solve reveal (D14, 20c). The status strip and sticky header were out of scope. |
| UX6 | **Fixed** (21d). |
| UX7 to UX15 | **Fixed** as recommended (21b, 21c, 20d with D17, 20e with D16, 19b, 19c, 21a, 20f). UX14 was only partly fixed until gate pass 3's H1 (the timer now starts on the first click). |
| UX16 | **Fixed** (19g, 20h, 21e). |
| UX17 | **Not taken** (taste). |
| Tiles label (a11y) | **Fixed** (19e). |

# UX pass 2, 2026-10-09

**Scope:** v1.2 at `e10193a`, served on `127.0.0.1:8123`. Themes: evening, day and auto. Widths: 1024x768 and the mobile preset (375x812, touch emulated). Data: the throwaway `127.0.0.1` storage only, the samples plus one test puzzle; `localhost` was never opened. The UX checks ran 33/0/0 before and after.
**Reviewer:** one read-only subagent following `/ux-gate-review`, cold. It stubbed `confirm()` (the pane closes native dialogs), so it read the confirm wording but didn't see the dialogs.
**Core tasks walked:** find and start; play with mistakes; undo; out of hearts and Continue in Zen; Reveal and Hints used; solve, with the reveal on a puzzle made from an image; restart; Create from a blank grid and from an image, leave and return, save; the More menu at both widths; print with and without the key; load samples; keyboard order and contrast in all three theme states.

## Findings

### Major
- **UX18. Saving a grid that matches a puzzle already in the library silently takes it over.** The id is a hash of the grid, so a banana made from `banana-10x10.png` at 10x10 got the sample Banana's id. Create said "Saved.", "Play it" opened a puzzle already solved, and the library row was renamed with no AI badge. "Load sample puzzles" then said all 9 were present, so the sample couldn't come back. **Recommend:** 1. If the id exists, say "This grid is already in your library as '<title>'" with Open it or Cancel, and never overwrite the title. 2. Keep the existing record and show "Already in your library" in place of "Saved."

### Minor
- **UX19.** Undoing a wrong fill removes the red cross but keeps the heart lost, so the board no longer explains the loss. **Recommend:** 1. Undo skips mistake crosses (they're facts the player paid for). 2. Undo refunds the heart.
- **UX20.** After Continue in Zen, Restart keeps Zen on, but its confirm says "Progress and hearts reset". **Recommend:** 1. Restart returns to the default rules. 2. Keep it, and change the copy.
- **UX21.** At 375px the More menu opens off the left edge ("ort for other solvers"), and on the last row below the fold. **Recommend:** 1. Left-align it to its button at narrow widths. 2. Flip it upward.
- **UX22.** At 375px, a scrolled 25x25 draws row clues over column clues in the corner, and stray clues show left of the gutter. **Recommend:** 1. Opaque gutter and corner backgrounds, the whole row gutter sticky, the corner pinned above both. 2. No sticky gutters below 768px until the touch pass.
- **UX23. *Plan-sourced: D4.*** On a touch phone there's no way to cross, and the legend gives mouse instructions. **Recommend:** 1. On a coarse pointer, say "Crossing needs a mouse for now". 2. A Fill/Cross toggle in the touch pass.
- **UX24.** At 375px the Create grid runs 61px past the screen, and Create has double the side padding. **Recommend:** 1. Same page padding as other screens, and fit Create's cells to the width like Play.

### Polish
- **UX25.** "Solved!" and Create's "Difficulty: …" look like buttons. **Recommend:** a flat badge.
- **UX26.** "Difficulty: Unchecked" before anything is filled; "Drop an image above, or start from a blank grid" beside a blank grid already on screen. **Recommend:** "Choose an image above, or draw on the grid below", and hide or rename "Blank grid" until an image is loaded.
- **UX27.** The Play header shows "AI test sample: Heart (5x5)" while the library shows the name and a badge (D15). **Recommend:** the same name and badge on Play.

### Taste
- **UX28.** Export save and Import save sit above the grid with Restart's weight.

## Pass 1 status, as observed
UX1, UX2, UX3, UX4, UX6, UX7, UX8 (desktop), UX10, UX11, UX12, UX13 resolved. UX5 partly (as scoped: the reveal and strip work; a past mistake cross goes grey like a player's own cross, and hearts are still small). UX9 partly (UX27, UX28). UX14 partly (fixed since, gate pass 3 H1). UX15 resolved at desktop, partly at 375 (UX22). UX16 mostly resolved. UX17 not addressed.

## What works
Direct drag-to-fill with a live run count; pre-crossed empty lines, "0" clues and numbers greying out, clear in both themes; mistake feedback at the cell; an unambiguous out-of-hearts state with two named ways out; a useful Reveal and an honest hint count; **the solve reveal is the emotional high point and must stay**; Create's instant conversion, self-picking threshold, title from the file name, live solver report, blocked empty Save, kept draft and clear next steps; a library with one primary button and an honest AI label; visible focus; text contrast 5.7:1 to 14:1.

## Accessibility basics (not an audit)
The play grid still isn't keyboard reachable (known). The theme button's accessible name ("Cycle theme…") doesn't contain its visible text, which can trip voice control. A lost heart is shown only by a ~10px glyph until the panel appears.

## Not checked
The native confirm dialogs themselves; a real print; export, import and webpbn downloads; Delete itself; tile sets; drag and drop onto Create; real touch hardware; screen readers, reduced motion, the theme flash; the hover crosshair after a solve; `beforeunload`; a 100+ puzzle library.

## UX checks
Gate pass 3 added `play-solve-reveal`, `play-auto-cross-sweep`, and stricter hint, not-started and 0-clue checks: 35 pass, 0 known. The reviewer suggested KNOWN checks for UX18 to UX22 and UX24; they are added once the owner decides those findings.

## Disposition
Owner's calls (2026-10-09): "do ux18, ux19 undo is fine, ux20 update message, ux21 do it, ux22 do it but add warning to puzzles unlikely to render well due to size, ux23 give cross and fill selectors for mobile, ux24 do it, do polish, explain ux28". Built as v1.3 (PLAN.md steps 23a to 25, decisions D20 and D21).

| Finding | Disposition |
|---|---|
| UX18 | **Fixing** (24a), option 1. |
| UX19 | **Accepted as is.** The owner is fine with undo removing the red cross while the heart stays lost. |
| UX20 | **Fixing** (23a), option 2: the confirm says what resets in each mode. |
| UX21 | **Fixing** (24d). |
| UX22 | **Fixing** (23b), plus a size warning (D20, 23c and 24e). |
| UX23 | **Fixing** (23d) with a Fill / Cross selector on touch screens (D21). |
| UX24 | **Fixing** (24b). |
| UX25 to UX27 | **Fixing** (23e, 24c). |
| UX28 | **Fixing** (23f). After the explanation, the owner: "move save buttons below the grid". |
