# Nonogram Studio

Browser nonogram maker and player: turns an image into a fair puzzle, then plays it. Plain JS modules, no build step, state in localStorage.

## Run and verify

- Serve: `python -m http.server 8123` from this folder, then open http://127.0.0.1:8123/ (use 127.0.0.1, not localhost).
- Full check, same as CI: `npm test && npm run lint && npm run format:check && npm run typecheck` (about 5 seconds).
- Area suites, run after changes in those areas, not in CI: `npm run test:solver_slow` (about 10s), `npm run test:difficulty_very_slow` (about a minute).
- UX checks: `npm run test:ux` (headless Chrome, runs in CI and pre-push), or open `/ux-checks.html` on the running server to watch them.
- Setup on a fresh clone: `npm ci`, then `git config core.hooksPath .githooks` (once; enables the commit-msg and pre-push hooks).

## Where things are

- `FEATURES.json` is the verification ledger: each entry is a check gate with a command that proves it. `PROGRESS.md` is generated from it and lists those gates only. What the product does and what is open is in `README.md` and the backlog in `PLAN.md`.
- The Create and Play views are folders, `src/views/create/` and `src/views/play/`: `index.js` owns `mount`/`unmount`, and each module gets one shared context (`context.js` documents its shape) and reaches the others as `ctx.<module>.fn()` at call time. ESLint rejects any `src/` file over 500 lines and any storage access outside `src/store.js`; inline `eslint-disable` comments are ignored.
- `PLAN.md` holds decisions D1 to D24, contracts and the backlog. `docs/` holds research and review records, `docs/plans/` the plans for upcoming work, and `FUTURE-WORK.md` the agreed next improvements.

## Rules

1. One active feature at a time. Activate, build, verify, in that order:
   `python scripts/features.py activate <id>` then `python scripts/features.py verify <id>`.
2. Never edit a feature's `state` or `evidence` by hand. Only `verify` can make it `passing`; `check` rejects a hand edit.
3. A feature with no runnable verify command is not specified yet. Write the command (a test file) first and watch it fail.
4. Do not claim a test passes without running it in this turn. Paste real output.
5. A fix to a Critical or High finding needs proof: a test that fails without the fix, or a mutation check.
6. Imports are untrusted input: allow-list keys at every depth, bound lengths and counts, and refuse duplicate ids.
7. No Co-Authored-By trailers. The commit-msg hook rejects them.
8. Every number a doc quotes (counts, timings) must be reproducible from this repo. Re-time before quoting.
9. Stay inside the active feature: no refactors, renames or fixes to unrelated code in the same change. Note them for later instead.
10. A `verify` command must fail if the thing it verifies is deleted or unregistered. `npm run test:ux` alone exits 0 with a check missing, so chain a test that pins the check's id (see `test/ux_registry.test.js`).

## End of a session

Run `python scripts/features.py clean`. It checks the feature list, runs the full check and the startup path, reports CI for the pushed commit, looks for debug leftovers, and warns about uncommitted changes and extra worktrees. Then `python scripts/features.py progress` and commit.

Periodic sweeps: `clean` and `status` flag any of four sweeps with no recorded run in 30 days. `/backlog-prune` finds stale deferred items, `/test-prune` finds tests that no longer earn their place, `/docs-consolidate` finds redundant or drifted docs and comments, and `/harness-audit` checks which controls fired and proposes one ablation. When one is flagged, or a phase or version has just closed, offer to run them before moving on. Each ends by recording its run: `python scripts/features.py event sweep <name>`.

These four are the maintainer's user-level Claude Code skills (`~/.claude/skills/`), not files in this repo. On any other machine they do not exist, so the flag never clears there. That is expected, not a broken check. Either write your own skills with those names (ending with the record command above), or set `"sweeps"` in `FEATURES.json` to the ones you keep (`[]` turns the prompt off) and delete this paragraph.
