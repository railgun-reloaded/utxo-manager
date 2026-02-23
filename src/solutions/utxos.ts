type ValueInput = {
  value: bigint;
}

type TreeInput = {
  treeNumber: bigint;
}

/**
 *
 * @param utxos
 */
const calculateTotalSpend = <T extends ValueInput>(utxos: T[]): bigint => {
  return utxos.reduce((left, right) => left + right.value, 0n)
}

/**
 *
 * @param utxos
 */
const filterZeroUTXOs = <T extends ValueInput>(utxos: T[]): T[] => {
  return utxos.filter((utxo) => utxo.value !== 0n)
}

/**
 *
 * @param left
 * @param right
 */
const sortUTXOsByAscendingValue = <T extends ValueInput>(left: T, right: T): number => {
  if (left.value > right.value) return 1
  if (left.value < right.value) return -1
  return 0
}

/**
 *
 * @param left
 * @param right
 */
const sortUTXOsByDescendingValue = <T extends ValueInput>(left: T, right: T): number => {
  if (left.value < right.value) return 1
  if (left.value > right.value) return -1
  return 0
}

/**
 *
 * @param inputs
 * @param sortFn
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
