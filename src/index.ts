export * from './solver'
export * from './state'
export * from './state/events'
export * from './state/indexer'
export * from './models'
export * from './spend'

export type { UTXOSolver, SolveParams, SolveResult, GreedySolveParams, RailgunSolveParams } from './interfaces'
export { SolverKind } from './interfaces'
export { BaseSolver } from './base-solver'
export { VALID_INPUT_COUNTS, VALID_OUTPUT_COUNTS } from './solutions/nullifiers'
export { selectInputsForTarget, findExactMatch } from './solutions/selection'
export { sortUTXOsByAscendingValue, sortUTXOsByDescendingValue } from './solutions/utxos'

import type { UTXOSolver } from './interfaces'
import { GreedySolver } from './solver'
import { RailgunSolver } from './spend/solution'

/**
 * Create a solver instance by type.
 * @param type - Solver type
 * @returns Solver instance
 */
export function createSolver (type: 'greedy' | 'railgun' = 'railgun'): UTXOSolver {
  return type === 'greedy' ? new GreedySolver() : new RailgunSolver()
}
