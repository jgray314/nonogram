# Nonogram Studio

A personal, browser-only tool for turning a picture into a fair nonogram (picross) and playing it. No runtime dependencies and no build step. All data stays in this browser's localStorage, so use **Export library** as your backup.

**What is stored.** Puzzles, your progress on each, and a few preferences (theme, and the Zen and Auto-cross defaults). A puzzle made from an image also keeps a small JPEG of its crop (at most 320px) for the picture that appears when you solve it. That copy stays in this browser and is included in library backups.

## Run

```
python -m http.server 8123
```

Run it from this folder, then open http://localhost:8123. Opening `index.html` as a file won't load the modules. After updating the code, reload with Ctrl+Shift+R so the browser doesn't keep old modules.

## Pages

- `#/library` lists your puzzles and tile sets: in progress first, then not started, then solved, A to Z within each. **Play** starts a puzzle. **More** holds Print, the webpbn XML export and Delete, which asks first. Samples show an "AI test sample" badge. On a narrow screen, puzzles 20 or more on a side say "Best on a big screen". The page also has backup and Load sample puzzles.
- `#/create` turns an image into a grid, at the image's own size if it is a 5 to 25 pixel-art source. The title comes from the file name. You can also start from a blank grid, edit by hand with Undo and Redo, see a live fairness report, and save one puzzle or a tile set. Save stays off until something is filled. Saving a grid that is already in your library changes nothing and links to the existing puzzle. Your draft is kept if you leave Create and come back. **Start over** clears it, and the browser warns before a reload loses it.
- `#/play/<id>` is the player. Left drag fills, right drag crosses, and Undo and Redo are buttons (Ctrl+Z / Ctrl+Y). Empty rows and columns start crossed and show a 0. A clue number greys out as soon as its block is complete. (On a puzzle without a unique solution, it waits until the block is fenced in by crosses or the edge.) The timer starts with your first click. On a touch screen, choose **Fill** or **Cross** above the grid, then tap or drag. A puzzle too big for the window says so and scrolls, with its clues pinned. **Export save** and **Import save**, under the grid, move one puzzle's progress to another browser as a file.
  - **Hearts** are on by default for puzzles with one solution. You get 3. A wrong fill turns into a red cross and costs a heart; a wrong cross is free. At 0 the grid locks, and you can **Restart** or **Continue in Zen mode**, which keeps your grid.
  - **Zen mode** turns hearts off. A wrong fill still turns into a red cross, but it costs nothing and nothing locks. You can switch to Zen at any time, but switching back to hearts restarts the puzzle. Puzzles without a unique solution are always in Zen mode.
  - **Auto-cross** is on by default: when a line's last number crosses out, the rest of the line is crossed for you.
  - Turning Zen or Auto-cross on or off also sets the default for puzzles you haven't started.
  - **Reveal a cell** fills in one correct square, from the line closest to done. "Hints used" counts them; undo doesn't give one back.
  - **Restart** clears the grid, timer, hearts and hints.
  - When you solve a puzzle made from an image, the picture fades in over the grid. Then a strip shows your time, any hints, and a link back to the library.
- `#/print/<id>` prints the clues and empty grid. Tick **Include answer key** to add the solution on page 2.

## Develop

```
npm test           # fast suite, under 1s
npm run test:slow  # exhaustive 4x4 solver checks, about 10s
npm run lint
npm run format:check
```

**UX checks.** With the server running, open http://127.0.0.1:8123/ux-checks.html. It drives the real app in a frame and checks what a player should see: hearts, mistakes, restart, Zen, hints, the solve reveal, clue numbers, Create, the library, print, narrow layout and basic labels. It resets the app's data, so it only runs on `127.0.0.1`, which keeps its own storage, and refuses to run on `localhost`, where your library lives. A check marked KNOWN is tied to an open finding in `nonogram-ux-review.md`. When one shows FIXED?, drop its `known` flag in `test/ux/checks.js`. Add `?only=<check id>` to run a single check.

`PLAN.md` has the design decisions, the contracts between modules, the backlog, and how this was built. `nonogram-plan-review.md` is the pre-build review record, `nonogram-gate.md` the code reviews, and `nonogram-ux-review.md` the UX reviews.
