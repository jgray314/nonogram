# Nonogram Studio

A personal, browser-only tool for turning a picture into a fair nonogram (picross) and playing it. No runtime dependencies and no build step. All data stays in this browser's localStorage, so use **Export library** as your backup.

## Run

```
python -m http.server 8123
```

Run it from this folder, then open http://localhost:8123. Opening `index.html` as a file won't load the modules.

## Pages

- `#/library` lists your puzzles and tile sets, and has backup, samples, print and webpbn XML export.
- `#/create` turns an image into a grid. You can also start from a blank grid, edit it, see a live fairness report, and save one puzzle or a tile set.
- `#/play/<id>` is the player. Left drag fills, right drag crosses, and Ctrl+Z / Ctrl+Y undo and redo. Empty rows and columns start crossed. With hearts on, a clue number greys out as soon as its block is complete. In Zen mode it greys out once the block is finished and fenced in by crosses or the edge, so the numbers give nothing away.
  - **Hearts** are on by default for puzzles with one solution. You get 3. A wrong fill turns into a red cross and costs a heart; a wrong cross is free. At 0 the grid locks until you restart.
  - **Zen mode** turns hearts off and brings back the optional Check mistakes switch. You can switch to Zen at any time, but switching back to hearts restarts the puzzle. Puzzles without a unique solution are always in Zen mode.
  - **Restart** clears the grid, timer and hearts.
- `#/print/<id>` prints the clues and empty grid. Tick **Include answer key** to add the solution on page 2.

## Develop

```
npm test           # fast suite, under 1s
npm run test:slow  # exhaustive 4x4 solver checks, about 10s
npm run lint
npm run format:check
```

`PLAN.md` has the design decisions, the contracts between modules, the backlog, and how this was built. `nonogram-plan-review.md` is the pre-build review record.
