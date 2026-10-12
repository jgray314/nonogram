// Difficulty label from a cached solver verdict ({status, sweeps, tier?}).
// The tier is the least skilled persona who finishes the puzzle
// (src/personas.js, difficulty-personas.md). Each line-solvable persona has
// its own label, and a large grid steps Easy or Medium up one (D23).
const TIER_LABEL = {
  newcomer: 'Easy',
  casual: 'Medium',
  regular: 'Hard',
  expert: 'Very hard',
  guess: 'Very hard',
};
const TIER_STATUS = {
  newcomer: 'unique-line-solvable',
  casual: 'unique-line-solvable',
  regular: 'unique-line-solvable',
  expert: 'unique-needs-guessing',
  guess: 'unique-needs-guessing',
};
// Personas rate technique, not effort, so a big grid of simple moves still
// reads one step harder. Same threshold as the size warning (D20).
export const LARGE_SIDE = 20;
const STEP_UP = { Easy: 'Medium', Medium: 'Hard' };

export function isFair(verdict) {
  return Boolean(verdict) && verdict.status.startsWith('unique');
}

/**
 * `size` ({width, height}) is the grid the verdict is for; without it no size
 * step applies. Verdicts saved before tiers existed have none. The library
 * fills in line-solvable ones first (`withTier`, cheap), so the 'Medium'
 * fallback is only for a caller that skips that (and for color puzzles, which
 * get no tier). A needs-guessing one without a tier is 'Very hard'.
 */
export function difficultyLabel(verdict, size = null) {
  if (!verdict) return 'Unchecked';
  if (!isFair(verdict)) return 'Not fair';
  if (verdict.status === 'unique-needs-guessing') return 'Very hard';
  // A tier that contradicts the status (a hand-edited import) is ignored.
  const tierOk = verdict.tier && TIER_STATUS[verdict.tier] === verdict.status;
  const label = tierOk ? TIER_LABEL[verdict.tier] : 'Medium';
  const large = size && Math.max(size.width, size.height) >= LARGE_SIDE;
  return large ? (STEP_UP[label] ?? label) : label;
}
