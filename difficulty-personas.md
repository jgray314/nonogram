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

The personas model technique, not patience. Size is shown next to the label, and a 25x25 Easy is still long.

## Method

`npm run test:slow` reruns everything in this section (`test/slow/personas.corpus.test.js`, seeded). It runs every persona over this corpus:
- The 9 samples.
- 200 picture-like grids (soft blobs, 5x5 to 25x25).
- 300 random grids at 45% to 75% density.

Of these 509, 394 are fair (a unique solution).

`test/personas.test.js` checks that the Newcomer and Casual techniques never deduce a wrong cell, on 3,000 random lines. A persona that did could "finish" a puzzle it can't.

The Expert stops after 4,000 trials (`PROBE_BUDGET`), and the puzzle then counts as Very hard, so it errs harder, never easier. Its slowest corpus puzzle took about 1.7 s. That runs in the solver worker, so the page doesn't freeze.

## Results

**The old rule (Easy if the line solver needs 3 or fewer sweeps) called almost everything Easy.** Puzzles the Casual persona finishes take 3 sweeps or fewer. So do most puzzles that need full line logic: the Regular tier's median is also 3 sweeps. Sweep count measures how many rounds the solver needs, not how hard each deduction is. Two examples under the old rule:
- The 15x15 Smiley, 10x10 Cat and 20x20 Cat samples were labelled Easy, but the Casual persona stalls on all three.
- Most dense random 25x25 grids were labelled Easy, and every one needs full line logic.

**Which persona finishes first**, over the fair puzzles:

| First to finish | Count | Line-solver sweeps (min / median / max) |
|---|---|---|
| Newcomer | 74 | 1 / 1 / 1 |
| Casual | 87 | 1 / 2 / 3 |
| Regular | 229 | 2 / 3 / 13 |
| Expert | 3 | 3 / 7 / 8 |
| Nobody (needs real guessing) | 1 | 2 |

**Picture-like grids**, the closest stand-in for the owner's puzzles, spread across tiers. From 10x10 to 20x20 they split roughly evenly between Newcomer, Casual and Regular. At 25x25 the Regular takes about half and the Newcomer almost none. Random grids almost all need the Regular, which matches how scattered pictures feel.

**The Expert tier is rare but real.** Of 4 puzzles that need more than line logic, the one-cell trial solves 3. The old rule called all 4 "Hard".

## The rule

| Label | First persona to finish |
|---|---|
| Easy | Newcomer or Casual |
| Medium | Regular |
| Hard | Expert (one-cell trial) |
| Very hard | Nobody: unique, but needs deeper guessing |
| Not fair, Unchecked | Unchanged |

The verdict stores the tier, computed in the solver worker when Create checks a grid.

Puzzles saved before D22 have no stored tier:
- **Line-solvable ones:** the library works out a tier for display and never writes it back.
- **Needs-guessing ones:** these keep "Hard", because the Expert's trials are too slow to run on the page itself.

On the samples, Smiley 15x15, Cat 10x10 and Cat 20x20 moved from Easy to Medium. The other six kept their labels: Heart, House and Cat 15x15 are Easy, and the rest are Medium. `test/personas.test.js` pins this.

## Limits

- The personas are models of people, not people. The owner's ~5 plays (step 13) test them.
- The generated grids aren't the owner's art. Photo-derived puzzles may land differently, especially in the Expert tier.
- The Casual technique set is a judgment call. It's the part most likely to move after play.
- Monochrome only: the techniques read run lengths and ignore color (PLAN.md backlog, color mode).
