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
  if (verdict.tier) return TIER_LABEL[verdict.tier];
  return verdict.status === 'unique-needs-guessing' ? 'Hard' : 'Medium';
}
