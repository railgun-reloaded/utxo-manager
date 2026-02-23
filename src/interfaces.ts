import type { OutputSolution, SpendingSolutionInput } from './models'
import type { SpendInput, SpendIntent, SpendTreeOutput } from './spend/models'

/**
 * Solver type identifiers.
 */
enum SolverKind {
  Greedy = 'greedy',
  Railgun = 'railgun'
}

/**
 * Parameters for solving a single-token spend.
 */
type GreedySolveParams = {
  kind: SolverKind.Greedy
  solution: SpendingSolutionInput
}

/**
 * Parameters for solving a railgun spend intent.
 */
type RailgunSolveParams = {
  kind: SolverKind.Railgun
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

export { SolverKind }
export type { GreedySolveParams, RailgunSolveParams, SolveParams, SolveResult, UTXOSolver }
