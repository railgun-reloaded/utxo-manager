import { GreedySolver } from './solvers/greedy'
import { RailgunSolver } from './solvers/railgun'
import type { UTXOSolver } from './solvers/types'

export * from './solvers/greedy'
export * from './solvers/railgun'
export type * from './solvers/greedy-models'
export type * from './solvers/railgun-models'
export * from './state'
export * from './state/events'
export * from './state/indexer'

export type { GreedySolveParams, RailgunSolveParams, SolveParams, SolveResult, TokenIdentity, UTXOSolver } from './solvers/types'
export { SolverKind, SpendingSolution, TokenType } from './solvers/types'
export { BaseSolver } from './solvers/base-solver'
export { VALID_INPUT_COUNTS, VALID_OUTPUT_COUNTS } from './primitives/nullifiers'
export { selectInputsForTarget, findExactMatch } from './primitives/selection'
export { sortUTXOsByAscendingValue, sortUTXOsByDescendingValue } from './primitives/utxos'

/**
 * Create a solver instance by type.
 * @param type - Solver type
 * @returns Solver instance
 */
export function createSolver (type: 'greedy' | 'railgun' = 'railgun'): UTXOSolver {
  return type === 'greedy' ? new GreedySolver() : new RailgunSolver()
}
