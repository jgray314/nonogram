# Future work

Improvements that are agreed in principle but not scheduled. `PLAN.md` holds the decisions and the triage backlog; this file holds work worth doing next, with enough detail to pick it up cold.

## Finish color puzzles

Color shipped in D25 to D29. These parts were left out on purpose.

1. **Difficulty label for color puzzles.** Color puzzles have no persona tier, so the library and the play header show "Medium" for all of them (`src/difficulty.js` falls back to `'Medium'` for line-solvable verdicts). The label is a guess, not a measurement. Decide what a persona does with colors, then rate color puzzles for real. `docs/color-research.md` has the owner decision on color-aware personas.
2. **Print in color.** `src/views/print.js` prints black and white. A color puzzle prints without its inks, so the clue colors are lost. Needs a clue color treatment that survives a black-and-white printer (for example a symbol or pattern per ink), not just color.
3. **Tile sets share one palette.** `makeSet` shares one palette array across tiles, and `tileFlags` (`src/tiles.js`) treats any non-zero cell as filled. Fine for monochrome and for color sets with one shared palette. A set where each tile has its own palette would draw the wrong face. Fix both together if per-tile palettes are ever wanted.
4. **Photo conversion quality.** Real-photo tests showed a clear step up after D28, with room left. The remaining problems have not been named. Collect a few photos that still look wrong, write down what is wrong with each, and only then change `src/color.js`. `research/color/cluster.mjs` compares methods and is the place to test an idea first.
5. **Hard samples.** A file of hard sample puzzles (`nonogram-hard-samples.json`) was exported from play testing and never reported on. Run it through the solver and persona tiers and record what it shows.

## Other

- Make the repository public when ready. `README.md` already discloses that the code is AI-written.
