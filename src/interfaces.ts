import type { OutputSolution, SpendingSolutionInput } from './models'
import type { SpendInput, SpendIntent, SpendTreeOutput } from './spend/models'

/**
 * Parameters for solving a single-token spend.
 */
type GreedySolveParams = {
  kind: 'greedy'
  solution: SpendingSolutionInput
}

/**
 * Parameters for solving a railgun spend intent.
 */
type RailgunSolveParams = {
  kind: 'railgun'
  intent: SpendIntent
  utxos: SpendInput[]
  isComplex?: boolean
}

/**
 * Union of all supported solve parameter shapes.
 */
type SolveParams = GreedySolveParams | RailgunSolveParams

/**
 * Union of possible solver results.
 */
type SolveResult = OutputSolution | SpendTreeOutput[] | undefined

/**
 * Unified solver interface for UTXO selection strategies.
 */
interface UTXOSolver {
  readonly name: string
  solve(params: SolveParams): SolveResult
}

export type { GreedySolveParams, RailgunSolveParams, SolveParams, SolveResult, UTXOSolver }
