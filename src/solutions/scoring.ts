type ValueInput = {
  value: bigint;
}

type SelectionScore = {
  inputCount: number;
  changeAmount: bigint;
  isExactMatch: boolean;
}

/**
 * Calculate score for a selection of inputs against a target.
 * @param inputs - Selected inputs
 * @param target - Target value to cover
 * @returns Score for this selection
 */
const scoreSelection = <T extends ValueInput>(
  inputs: T[],
  target: bigint
): SelectionScore => {
  const total = inputs.reduce((sum, i) => sum + i.value, 0n)
  return {
    inputCount: inputs.length,
    changeAmount: total - target,
    isExactMatch: total === target
  }
}

/**
 * Compare two selection scores. Lower is better.
 * Priority: exact match > fewer inputs > less change
 * @param a - First score
 * @param b - Second score
 * @returns Negative if a better, positive if b better, 0 if equal
 */
const compareScores = (a: SelectionScore, b: SelectionScore): number => {
  // Exact match always wins
  if (a.isExactMatch && !b.isExactMatch) return -1
  if (!a.isExactMatch && b.isExactMatch) return 1

  // Fewer inputs wins
  if (a.inputCount !== b.inputCount) {
    return a.inputCount - b.inputCount
  }

  // Less change wins
  if (a.changeAmount !== b.changeAmount) {
    return Number(a.changeAmount - b.changeAmount)
  }

  return 0
}

export { scoreSelection, compareScores, type SelectionScore }
