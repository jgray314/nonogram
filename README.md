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
- `#/play/<id>` is the player. Left drag fills, right drag crosses, and Ctrl+Z / Ctrl+Y undo and redo. Empty rows and columns start crossed. A clue number greys out as soon as its block is complete. (On a puzzle without a unique solution, it waits until the block is fenced in by crosses or the edge.)
  - **Hearts** are on by default for puzzles with one solution. You get 3. A wrong fill turns into a red cross and costs a heart; a wrong cross is free. At 0 the grid locks until you restart.
  - **Zen mode** turns hearts off. A wrong fill still turns into a red cross, but it costs nothing and nothing locks. You can switch to Zen at any time, but switching back to hearts restarts the puzzle. Puzzles without a unique solution are always in Zen mode.
  - **Restart** clears the grid, timer and hearts.
- `#/print/<id>` prints the clues and empty grid. Tick **Include answer key** to add the solution on page 2.

## Develop

```
npm test           # fast suite, under 1s
npm run test:slow  # exhaustive 4x4 solver checks, about 10s
npm run lint
npm run format:check
```

**UX checks.** With the server running, open http://127.0.0.1:8123/ux-checks.html. It drives the real app in a frame and checks what a player should see: hearts, mistakes, restart, Zen, clue numbers, Create, print, narrow layout and basic labels. It resets the app's data, so it only runs on `127.0.0.1`, which keeps its own storage, and refuses to run on `localhost`, where your library lives. A check marked KNOWN is tied to an open finding in `nonogram-ux-review.md`. When one shows FIXED?, drop its `known` flag in `test/ux/checks.js`. Add `?only=<check id>` to run a single check.

`PLAN.md` has the design decisions, the contracts between modules, the backlog, and how this was built. `nonogram-plan-review.md` is the pre-build review record.
