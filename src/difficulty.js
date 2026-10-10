// Difficulty label from a cached solver verdict ({status, sweeps, tier?}).
// The tier is the least skilled persona who finishes the puzzle
// (src/personas.js, difficulty-personas.md); step 13's play calibrates it.
const TIER_LABEL = {
  newcomer: 'Easy',
  casual: 'Easy',
  regular: 'Medium',
  expert: 'Hard',
  guess: 'Very hard',
};
const TIER_STATUS = {
  newcomer: 'unique-line-solvable',
  casual: 'unique-line-solvable',
  regular: 'unique-line-solvable',
  expert: 'unique-needs-guessing',
  guess: 'unique-needs-guessing',
};

export function isFair(verdict) {
  return Boolean(verdict) && verdict.status.startsWith('unique');
}

/**
 * Verdicts saved before tiers existed have none. The library fills in line-
 * solvable ones first (`withTier`, cheap), so the 'Medium' fallback is only for
 * a caller that skips that. A needs-guessing one without a tier stays 'Hard'.
 */
export function difficultyLabel(verdict) {
  if (!verdict) return 'Unchecked';
  if (!isFair(verdict)) return 'Not fair';
  // A tier that contradicts the status (a hand-edited import) is ignored.
  if (verdict.tier && TIER_STATUS[verdict.tier] === verdict.status) return TIER_LABEL[verdict.tier];
  return verdict.status === 'unique-needs-guessing' ? 'Hard' : 'Medium';
}
