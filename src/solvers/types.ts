import type { OutputSolution, SpendingSolutionInput } from './greedy-models'
import type { SpendInput, SpendIntent, SpendTreeOutput } from './railgun-models'

/**
 * Token-class enum.
 */
enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
}

/**
 * Triple that uniquely identifies a token in the RAILGUN system: contract
 * address, token class, and sub-identifier.
 */
type TokenIdentity = {
  tokenAddress: string
  tokenType: TokenType
  tokenSubID: string
}

/**
 * Solver type identifiers.
 */
enum SolverKind {
  Greedy = 'greedy',
  Railgun = 'railgun'
}

/**
 * Solving strategy: `Simple` picks smallest inputs first (preserves larger
 * notes for future spends); `Consolidation` picks largest first to reduce
 * note count.
 */
enum SpendingSolution {
  Simple,
  Consolidation,
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

export { SolverKind, SpendingSolution, TokenType }
export type { GreedySolveParams, RailgunSolveParams, SolveParams, SolveResult, TokenIdentity, UTXOSolver }
