import { findExactMatch } from './selection'
import { groupInputsByTree } from './utxos'

type ValueInput = {
  value: bigint;
}

type TreeInput = {
  treeNumber: bigint;
}

type BatchResult<T extends ValueInput & TreeInput> = {
  inputs: T[];
  total: bigint;
  treeNumber: bigint;
}

/**
 * Sum input values.
 * @param inputs - Inputs to sum
 * @returns Total value
 */
const sumValues = <T extends ValueInput>(inputs: T[]): bigint => {
  return inputs.reduce((left, right) => left + right.value, 0n)
}

/**
 * Select multiple batches of inputs to cover a target value.
 * Each batch respects maxInputs and ensures inputs within a batch come from the same tree.
 *
 * Algorithm:
 * 1. Check if any single tree has an exact match (prioritize efficiency)
 * 2. Otherwise, iteratively select up to maxInputs from the best available tree
 * 3. Continue until target is covered or inputs are exhausted
 * @param inputs - Available inputs to select from
 * @param target - Target value to cover
 * @param maxInputs - Maximum inputs per batch (default 10)
 * @param sortFn - Optional sort function for ordering inputs
 * @returns Array of batches, each with inputs from a single tree
 */
const selectBatchesForTarget = <T extends ValueInput & TreeInput>(
  inputs: T[],
  target: bigint,
  maxInputs: number = 10,
  sortFn?: (left: T, right: T) => number
): BatchResult<T>[] => {
  if (target <= 0n || maxInputs <= 0 || inputs.length === 0) {
    return []
  }

  // Group inputs by tree and sort within each tree
  const { availableTrees, sortedInputs } = groupInputsByTree(inputs, sortFn)

  // Step 1: Check for exact match in any single tree (most efficient)
  for (const [treeKey, treeInputs] of Object.entries(sortedInputs)) {
    const exactMatch = findExactMatch(treeInputs, target, maxInputs)
    if (exactMatch) {
      return [{
        inputs: exactMatch,
        total: sumValues(exactMatch),
        treeNumber: BigInt(treeKey)
      }]
    }
  }

  // Step 2: Greedily select batches across trees
  const batches: BatchResult<T>[] = []
  let remainingTarget = target
  const usedInputIds = new Set<string>()

  /**
   * Generate unique ID for input tracking.
   * @param input - Input to generate ID for
   * @returns Unique identifier string
   */
  const getInputId = (input: T): string => {
    const leafIndex = (input as any).leafIndex
    return leafIndex !== undefined
      ? `${input.treeNumber}-${leafIndex}`
      : `${input.treeNumber}-${input.value}-${inputs.indexOf(input)}`
  }

  while (remainingTarget > 0n) {
    // Find the best tree to select from (tree with most value available)
    let bestTreeKey: string | null = null
    let bestTreeValue = 0n

    for (const [treeKey] of Object.entries(availableTrees)) {
      const treeInputs = sortedInputs[treeKey]
      if (!treeInputs) continue

      // Calculate available value in this tree (excluding used inputs)
      const availableValue = treeInputs
        .filter(input => !usedInputIds.has(getInputId(input)))
        .reduce((sum, input) => sum + input.value, 0n)

      if (availableValue > bestTreeValue) {
        bestTreeValue = availableValue
        bestTreeKey = treeKey
      }
    }

    // No more inputs available
    if (!bestTreeKey || bestTreeValue === 0n) {
      break
    }

    // Select up to maxInputs from the best tree
    const treeInputs = sortedInputs[bestTreeKey]!
    const availableInputs = treeInputs.filter(input => !usedInputIds.has(getInputId(input)))

    const batchInputs: T[] = []
    let batchTotal = 0n

    for (const input of availableInputs) {
      if (batchInputs.length >= maxInputs) break

      batchInputs.push(input)
      batchTotal += input.value
      usedInputIds.add(getInputId(input))

      // If we've covered the remaining target, we can stop
      if (batchTotal >= remainingTarget) break
    }

    // Add this batch to results
    if (batchInputs.length > 0) {
      batches.push({
        inputs: batchInputs,
        total: batchTotal,
        treeNumber: BigInt(bestTreeKey)
      })

      remainingTarget -= batchTotal
    } else {
      // No inputs could be selected, break to avoid infinite loop
      break
    }
  }

  // Check if we successfully covered the target
  const totalCovered = batches.reduce((sum, batch) => sum + batch.total, 0n)
  if (totalCovered < target) {
    return [] // Failed to cover target
  }

  return batches
}

export { selectBatchesForTarget, type BatchResult }
