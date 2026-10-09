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
- `#/play/<id>` is the player.
- `#/print/<id>` prints the clues and empty grid, with the answer key on page 2.

## Develop

```
npm test           # fast suite, under 1s
npm run test:slow  # exhaustive 4x4 solver checks, about 10s
npm run lint
npm run format:check
```

`PLAN.md` has the design decisions, the contracts between modules, the backlog, and how this was built. `nonogram-plan-review.md` is the pre-build review record.
