type ValueInput = {
  value: bigint;
}

type TreeInput = {
  treeNumber: bigint;
}

/**
 * Calculate total spend.
 * @param utxos - UTXOs to sum
 * @returns Total value
 */
const calculateTotalSpend = <T extends ValueInput>(utxos: T[]): bigint => {
  return utxos.reduce((left, right) => left + right.value, 0n)
}

/**
 * Filter out zero value UTXOs.
 * @param utxos - UTXOs to filter
 * @returns Filtered UTXOs
 */
const filterZeroUTXOs = <T extends ValueInput>(utxos: T[]): T[] => {
  return utxos.filter((utxo) => utxo.value !== 0n)
}

/**
 * Sort UTXOs by ascending value.
 * @param left - First input
 * @param right - Second input
 * @returns Comparison result
 */
const sortUTXOsByAscendingValue = <T extends ValueInput>(left: T, right: T): number => {
  if (left.value > right.value) return 1
  if (left.value < right.value) return -1
  return 0
}

/**
 * Sort UTXOs by descending value.
 * @param left - First input
 * @param right - Second input
 * @returns Comparison result
 */
const sortUTXOsByDescendingValue = <T extends ValueInput>(left: T, right: T): number => {
  if (left.value < right.value) return 1
  if (left.value > right.value) return -1
  return 0
}

/**
 * Group inputs by tree.
 * @param inputs - Inputs to group
 * @param sortFn - Optional sort function
 * @returns Grouped inputs by tree
 */
const groupInputsByTree = <T extends ValueInput & TreeInput>(
  inputs: T[],
  sortFn?: (left: T, right: T) => number
): { availableTrees: Record<string, bigint>; sortedInputs: Record<string, T[]> } => {
  const availableTrees: Record<string, bigint> = {}
  const sortedInputs: Record<string, T[]> = {}

  inputs.forEach((input) => {
    const treeKey = input.treeNumber.toString(10)
    availableTrees[treeKey] ??= 0n
    availableTrees[treeKey]! += input.value

    sortedInputs[treeKey] ??= []
    sortedInputs[treeKey]?.push(input)
  })

  if (sortFn) {
    Object.values(sortedInputs).forEach((treeInputs) => {
      treeInputs.sort(sortFn)
    })
  }

  return { availableTrees, sortedInputs }
}

export {
  calculateTotalSpend,
  filterZeroUTXOs,
  sortUTXOsByAscendingValue,
  sortUTXOsByDescendingValue,
  groupInputsByTree,
}
