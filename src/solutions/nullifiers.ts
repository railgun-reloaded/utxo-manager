const VALID_INPUT_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
const VALID_OUTPUT_COUNTS = [1, 2, 3, 4, 5] as const

const MAX_INPUTS = VALID_INPUT_COUNTS[VALID_INPUT_COUNTS.length - 1] ?? 0
const MAX_OUTPUTS = VALID_OUTPUT_COUNTS[VALID_OUTPUT_COUNTS.length - 1] ?? 0
const MAX_TOTAL_IO = 14

/**
 * Check if input count is valid.
 * @param utxoCount - Input count
 * @returns True if valid
 */
const isValidNullifierCount = (utxoCount: number): boolean => {
  return VALID_INPUT_COUNTS.includes(utxoCount as (typeof VALID_INPUT_COUNTS)[number])
}

/**
 * Check if output count is valid.
 * @param outputCount - Output count
 * @returns True if valid
 */
const isValidOutputCount = (outputCount: number): boolean => {
  return VALID_OUTPUT_COUNTS.includes(outputCount as (typeof VALID_OUTPUT_COUNTS)[number])
}

/**
 * Check if input and output counts are valid together.
 * @param inputCount - Input count
 * @param outputCount - Output count
 * @returns True if valid
 */
const isValidInputOutputCount = (inputCount: number, outputCount: number): boolean => {
  if (!isValidNullifierCount(inputCount)) return false
  if (!isValidOutputCount(outputCount)) return false
  return inputCount + outputCount <= MAX_TOTAL_IO
}

/**
 * Find max inputs for given outputs.
 * @param outputCount - Output count
 * @returns Max inputs
 */
const findMaxInputsForOutputs = (outputCount: number): number => {
  return Math.min(MAX_INPUTS, MAX_TOTAL_IO - outputCount)
}

export {
  VALID_INPUT_COUNTS,
  VALID_OUTPUT_COUNTS,
  MAX_INPUTS,
  MAX_OUTPUTS,
  MAX_TOTAL_IO,
  isValidNullifierCount,
  isValidOutputCount,
  isValidInputOutputCount,
  findMaxInputsForOutputs,
}
