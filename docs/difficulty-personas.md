# Difficulty personas (D22, 2026-10-09)

The starting point for the difficulty labels, before the owner's calibration by play (PLAN.md step 13). Each persona is a solver that knows only certain techniques. A puzzle's rating is the least skilled persona who can finish it without guessing. Play then checks whether the personas match real people.

## The personas

The code is `src/personas.js`.

| Persona | Who | Techniques |
|---|---|---|
| **Newcomer** | First nonogram, followed the tutorial | Overlap counted from both ends of a whole line (which also settles empty and full lines); cross the rest once all fills are placed |
| **Casual** | Plays puzzle apps on the couch | Everything above, plus: trim crossed cells off the ends and redo overlap on what's left; grow a run from a filled cell at the edge of the open span |
| **Regular** | Plays most days, knows the standard tricks | Complete single-line logic: anything provable from one row or column on its own (the app's own line solver) |
| **Expert** | Seeks out hard puzzles | Everything above, plus a one-cell trial: assume a cell, follow the line logic, and if that contradicts, the cell is the other value |

Beyond the Expert is real guessing: deeper trials, or backtracking.

The personas model technique, not patience. A big grid of simple moves is still long, so the shown label adds a size step (D23, under "The rule").

## Method

`npm run test:extended` reruns everything in this section (`test/extended/personas.corpus.test.js`, seeded, about a minute). It runs every persona over this corpus:
- The 11 samples.
- 200 picture-like grids (soft blobs, 5x5 to 25x25).
- 300 random grids at 45% to 75% density.

Of these 511, 396 are fair (a unique solution).

`test/personas.test.js` checks that the Newcomer and Casual techniques never deduce a wrong cell, on 3,000 random lines. A persona that did could "finish" a puzzle it can't.

The Expert stops after 4,000 trials (`PROBE_BUDGET`), and the puzzle then counts as Very hard, so it errs harder, never easier. Its slowest corpus puzzle took about 2 s on the owner's laptop (a wall-clock time, so it varies by machine and run, unlike the seeded counts). That runs in the solver worker, so the page doesn't freeze.

## Results

**The old rule (Easy if the line solver needs 3 or fewer sweeps) called almost everything Easy.** Puzzles the Casual persona finishes take 3 sweeps or fewer. So do most puzzles that need full line logic: the Regular tier's median is also 3 sweeps. Sweep count measures how many rounds the solver needs, not how hard each deduction is. Two examples under the old rule:
- The 15x15 Smiley, 10x10 Cat and 20x20 Cat samples were labelled Easy, but the Casual persona stalls on all three.
- Most dense random 25x25 grids were labelled Easy, and every one needs full line logic.

**Which persona finishes first**, over the fair puzzles:

| First to finish | Count | Line-solver sweeps (min / median / max) |
|---|---|---|
| Newcomer | 76 | 1 / 1 / 1 |
| Casual | 87 | 1 / 2 / 3 |
| Regular | 229 | 2 / 3 / 13 |
| Expert | 3 | 3 / 7 / 8 |
| Nobody (needs real guessing) | 1 | 2 |

**Picture-like grids**, the closest stand-in for the owner's puzzles, spread across tiers. At 10x10 and 15x15 they split roughly evenly between Newcomer, Casual and Regular. At 20x20 the Regular leads (17 of 39), and at 25x25 it takes about half (19 of 36) with the Newcomer almost gone (2). From 10x10 up, random grids almost all need the Regular (the `noise` lines), which matches how scattered pictures feel.

**The Expert tier is rare but real.** Of 4 puzzles that need more than line logic, the one-cell trial solves 3. The old rule called all 4 "Hard".

## The rule

D23 (2026-10-11) replaced D22's first mapping after the owner's play. The owner found Easy and Medium about right, but asked for the line-solvable range to split three ways and for the Expert to read Very hard.

| Label | First persona to finish |
|---|---|
| Easy | Newcomer |
| Medium | Casual |
| Hard | Regular |
| Very hard | Expert (one-cell trial), or nobody (deeper guessing) |
| Not fair, Unchecked | Unchanged |

**Size step.** A grid 20 or more cells on its longer side moves Easy to Medium and Medium to Hard. Hard and Very hard don't move. The threshold is the same as the size warning (D20). Fair picture-like grids, as the shown label (the `blob` lines of `npm run test:extended`; none is Very hard):

| Size | Fair | Easy | Medium | Hard |
|---|---|---|---|---|
| 5x5 | 39 | 23 | 13 | 3 |
| 10x10 | 39 | 13 | 12 | 14 |
| 15x15 | 37 | 11 | 12 | 14 |
| 20x20 | 39 | 0 | 12 | 27 |
| 25x25 | 36 | 0 | 2 | 34 |

Without the step, Hard is just the Regular tier: 17 of 39 at 20x20 and 19 of 36 at 25x25, against the owner's expectation that most big puzzles should be Hard.

The verdict stores the tier, computed in the solver worker when Create checks a grid. The size step is applied when the label is shown, so it reaches every puzzle and nothing stored changes.

Puzzles saved before D22 have no stored tier:
- **Line-solvable ones:** the library works out a tier for display and never writes it back.
- **Needs-guessing ones:** these read "Very hard", the same as both tiers they could have.

A tier that contradicts the verdict's status (a hand-edited import) is ignored. A puzzle with more than one color gets no tier, because the techniques assume a gap between runs; it reads Medium, with the size step.

On the samples, Plus 5x5 and Castle 10x10 are Easy (added in D23, since no earlier sample was), Heart, House and Cat 15x15 are Medium, and the other six are Hard. `test/personas.test.js` pins this.

## Limits

- The personas are models of people, not people. The owner's play (step 13) tests them; the first round gave D23.
- The personas never make a mistake. People do, and more often on big or dense grids, where one slip costs a heart and a long search. The owner: the personas didn't "entirely match the feel of playing, especially recognizing the human limits of not making mistakes". The D23 size step stands in for that; nothing models it directly.
- The generated grids aren't the owner's art. Photo-derived puzzles may land differently, especially in the Expert tier.
- The Casual technique set is a judgment call. It's the part most likely to move after play.
- Monochrome only: the techniques read run lengths and ignore color (PLAN.md backlog, color mode).
