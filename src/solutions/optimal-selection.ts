import type { SelectionScore } from './scoring'
import { compareScores, scoreSelection } from './scoring'
import { findExactMatch } from './selection'

type ValueInput = {
  value: bigint;
}

type OptimalSelectionResult<T extends ValueInput> = {
  inputs: T[];
  total: bigint;
  score: SelectionScore;
}

/**
 * Try multiple selection strategies and return the best one.
 * @param inputs - Available inputs
 * @param target - Target value
 * @param maxInputs - Maximum inputs allowed
 * @returns Best selection or undefined
 */
const selectOptimalInputs = <T extends ValueInput>(
  inputs: T[],
  target: bigint,
  maxInputs: number
): OptimalSelectionResult<T> | undefined => {
  if (target <= 0n || maxInputs <= 0 || inputs.length === 0) {
    return undefined
  }

  const candidates: OptimalSelectionResult<T>[] = []

  // Strategy 1: Exact match (1 or 2 inputs) - EARLY EXIT if perfect
  const exactMatch = findExactMatch(inputs, target, Math.min(maxInputs, 2))
  if (exactMatch) {
    const total = exactMatch.reduce((sum, i) => sum + i.value, 0n)
    if (total === target) {
      // Perfect match - skip all other strategies
      return {
        inputs: exactMatch,
        total,
        score: scoreSelection(exactMatch, target)
      }
    }
    candidates.push({
      inputs: exactMatch,
      total,
      score: scoreSelection(exactMatch, target)
    })
  }

  // Sort once and reuse
  const descending = [...inputs].sort((a, b) => {
    if (a.value > b.value) return -1
    if (a.value < b.value) return 1
    return 0
  })
  const ascending = [...descending].reverse()

  // Strategy 2: Single large UTXO that covers target
  const singleCover = descending.find(i => i.value >= target)
  if (singleCover) {
    candidates.push({
      inputs: [singleCover],
      total: singleCover.value,
      score: scoreSelection([singleCover], target)
    })
  }

  // Strategy 3: Smallest set of largest UTXOs
  let accumulated = 0n
  const largestSet: T[] = []
  for (const input of descending) {
    if (accumulated >= target) break
    if (largestSet.length >= maxInputs) break
    largestSet.push(input)
    accumulated += input.value
  }

  if (accumulated >= target) {
    candidates.push({
      inputs: largestSet,
      total: accumulated,
      score: scoreSelection(largestSet, target)
    })
  }

  // Strategy 4: Greedy from smallest (good for minimizing change)
  accumulated = 0n
  const smallestSet: T[] = []
  for (const input of ascending) {
    if (accumulated >= target) break
    if (smallestSet.length >= maxInputs) break
    smallestSet.push(input)
    accumulated += input.value
  }

  if (accumulated >= target) {
    candidates.push({
      inputs: smallestSet,
      total: accumulated,
      score: scoreSelection(smallestSet, target)
    })
  }

  // No valid candidates
  if (candidates.length === 0) {
    return undefined
  }

  // Pick best candidate by score
  candidates.sort((a, b) => compareScores(a.score, b.score))
  return candidates[0]
}

export { selectOptimalInputs, type OptimalSelectionResult }
