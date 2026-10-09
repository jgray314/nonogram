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
*Pending the owner's calls.*
