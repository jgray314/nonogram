# Difficulty personas (2026-10-09)

Initial level-set for the difficulty labels, before the owner's calibration by play (PLAN.md step 13). Each persona is a solver that knows only certain techniques. A puzzle's rating is the least skilled persona who can finish it without guessing. Play then checks whether the personas match real people.

## The personas

| Persona | Who | Techniques | Patience |
|---|---|---|---|
| **Newcomer** | First nonogram, followed the tutorial | Empty lines and lines whose runs fill the whole length; overlap on a blank line; cross the rest once all fills are placed | 5x5 to 10x10, a few minutes |
| **Casual** | Plays puzzle apps on the couch | Everything above, plus: trim crossed cells off the ends and redo overlap on what's left; glue a run to a filled cell at the edge of the open span | Up to 15x15, 10 to 20 minutes |
| **Regular** | Plays most days, knows the standard tricks | Complete single-line logic: anything provable from one row or column on its own (the app's own line solver) | Up to 25x25, will spend an hour |
| **Expert** | Seeks out hard puzzles | Everything above, plus a one-cell trial: assume a cell, follow the line logic, and if that contradicts, the cell is the other value | Anything |

Beyond the Expert is real guessing: deeper trials, or backtracking.

## Method

A one-off script ran each persona on a puzzle until it stopped making progress, checking every deduction against the true solution so a persona never "finishes" by luck. The personas now live in `src/personas.js`; `test/personas.test.js` keeps the no-wrong-deduction check, on random lines. The Expert stops after 4,000 trials (`PROBE_BUDGET`) and the puzzle then counts as Very hard; on random 25x25 needs-guessing grids it took 339 ms at most, in the worker. The corpus:
- The 9 samples.
- 190 picture-like grids (soft blobs, 5x5 to 25x25).
- 300 random grids at 45% to 75% density.

Of these 509, 394 are fair (a unique solution).

## Results

**The current rule (Easy if the line solver needs 3 or fewer sweeps) calls almost everything Easy.** Every puzzle the Casual persona finishes takes 3 sweeps or fewer. So do most puzzles that need full line logic: the Regular tier's median is also 3 sweeps. Sweep count measures how many rounds the solver needs, not how hard each deduction is. Examples:
- The 15x15 Smiley, 10x10 Cat and 20x20 Cat samples are labelled Easy, but the Casual persona stalls on all three.
- Every dense random 25x25 grid is labelled Easy, and every one needs full line logic.

**Which persona finishes first**, over the fair puzzles:

| First to finish | Count | Line-solver sweeps (min / median / max) |
|---|---|---|
| Newcomer | 48 | 1 / 1 / 1 |
| Casual | 113 | 1 / 2 / 3 |
| Regular | 229 | 2 / 3 / 13 |
| Expert | 3 | 3 / 7 / 8 |
| Nobody (needs real guessing) | 1 | 2 |

**Picture-like grids**, the closest stand-in for the owner's puzzles, spread across tiers. At 10x10 and larger, roughly a sixth go to the Newcomer, two fifths to the Casual and two fifths to the Regular. Random grids almost all need the Regular, which matches how scattered pictures feel.

**The Expert tier is rare but real.** Of 4 puzzles that need more than line logic, the one-cell trial solves 3. Today all 4 would be "Hard".

## The rule (adopted as D22, 2026-10-09)

| Label | First persona to finish |
|---|---|
| Easy | Newcomer or Casual |
| Medium | Regular |
| Hard | Expert (one-cell trial) |
| Very hard | Nobody: unique, but needs deeper guessing |
| Not fair, Unchecked | Unchanged |

Size stays a separate fact: it's already shown, and a 25x25 Easy is still long.

Puzzles saved before D22 have no stored tier. The library works one out for display and never writes it back. A needs-guessing puzzle without one keeps "Hard", because the Expert's trials are too slow to run on the page itself.

On the samples, Smiley 15x15, Cat 10x10 and Cat 20x20 move from Easy to Medium. The rest keep their labels.

## Limits

- The personas are models of people, not people. The owner's ~5 plays (step 13) test them.
- The generated grids aren't the owner's art. Photo-derived puzzles may land differently, especially in the Expert tier.
- The Casual technique set is a judgment call. It's the part most likely to move after play.
