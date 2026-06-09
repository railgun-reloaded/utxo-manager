import { BaseSolver } from './base-solver'
import type { SolveParams, SolveResult } from './interfaces'
import { SolverKind } from './interfaces'
import type { Input, OutputSolution, SpendingSolutionInput } from './models'
import { SpendingSolution, TokenType } from './models'
import { NFTNotOwnedOrSpentError, selectNFTInput } from './solutions/nft-selection'
import { MAX_INPUTS, isValidInputOutputCount } from './solutions/nullifiers'
import { selectInputsForTarget } from './solutions/selection'
import {
  filterZeroUTXOs,
  sortUTXOsByAscendingValue,
  sortUTXOsByDescendingValue,
} from './solutions/utxos'

/**
 * Greedy single-token solver.
 */
class GreedySolver extends BaseSolver<
  Input,
  OutputSolution['outputs'][number],
  OutputSolution
> {
  /** Solver name. */
  readonly name = SolverKind.Greedy

  /**
   * Solve a single-token spending solution.
   * @param params - Solve parameters
   * @returns Solution result
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== SolverKind.Greedy) {
      throw new Error(`GreedySolver expects params.kind === '${SolverKind.Greedy}'`)
    }

    const solution = params.solution
    if (!solution.type) {
      solution.type = SpendingSolution.Simple
    }

    if (solution.amount <= 0n) return undefined

    const identityFiltered = solution.inputs.filter(
      (input) =>
        input.tokenAddress === solution.tokenAddress &&
        input.tokenType === solution.tokenType &&
        input.tokenSubID === solution.tokenSubID
    )

    if (solution.tokenType === TokenType.ERC721) {
      return this.solveERC721(solution, identityFiltered)
    }

    if (solution.tokenType !== TokenType.ERC20) {
      throw new Error(`Unsupported token type: ${String(solution.tokenType)}`)
    }

    return this.solveERC20(solution, identityFiltered)
  }

  /**
   * Sum-to-target selection for ERC20.
   * @param solution - Spending solution input.
   * @param identityFiltered - Inputs filtered to the target token identity.
   * @returns Output solution, or `undefined` if no tree covers the amount.
   */
  private solveERC20 (
    solution: SpendingSolutionInput,
    identityFiltered: Input[]
  ): OutputSolution | undefined {
    const filteredInputs = filterZeroUTXOs(identityFiltered)
    if (filteredInputs.length === 0) return undefined

    const sortFn =
      solution.type === SpendingSolution.Consolidation
        ? sortUTXOsByDescendingValue
        : sortUTXOsByAscendingValue
    const preferHigherEfficiency = solution.type === SpendingSolution.Consolidation

    const { availableTrees, sortedInputs } = this.getTreeInputs(filteredInputs, sortFn)
    const treeSolutions: OutputSolution[] = []

    Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
      const treeValue = availableTrees[treeNumber] ?? 0n
      if (treeValue < solution.amount) return

      const selection = selectInputsForTarget(
        treeInputs,
        solution.amount,
        MAX_INPUTS,
        sortFn
      )
      if (!selection) return

      const outputs = [
        {
          tokenAddress: solution.tokenAddress,
          tokenType: solution.tokenType,
          tokenSubID: solution.tokenSubID,
          value: solution.amount,
          recipientAddress: solution.recipientAddress,
        },
      ]

      const change = selection.total - solution.amount
      if (change > 0n) {
        outputs.push({
          tokenAddress: solution.tokenAddress,
          tokenType: solution.tokenType,
          tokenSubID: solution.tokenSubID,
          value: change,
          recipientAddress: solution.changeAddress,
        })
      }

      if (!isValidInputOutputCount(selection.inputs.length, outputs.length)) return

      treeSolutions.push({
        inputs: selection.inputs,
        outputs,
      })
    })

    return this.pickBestSolution(
      treeSolutions,
      solution.changeAddress,
      (output) => output.recipientAddress,
      preferHigherEfficiency,
      isValidInputOutputCount
    )
  }

  /**
   * Single-input selection for ERC721. `amount` must be `1n`.
   * @param solution - Spending solution input.
   * @param identityFiltered - Inputs filtered to the target token identity.
   * @returns Output solution with one input and one output.
   * @throws {NFTNotOwnedOrSpentError} When no matching unspent input exists.
   */
  private solveERC721 (
    solution: SpendingSolutionInput,
    identityFiltered: Input[]
  ): OutputSolution {
    if (solution.amount !== 1n) {
      throw new Error(`ERC721 spend amount must be 1, got ${solution.amount}`)
    }

    const match = selectNFTInput(identityFiltered, {
      collection: solution.tokenAddress,
      tokenId: solution.tokenSubID,
    })

    return {
      inputs: [match],
      outputs: [
        {
          tokenAddress: solution.tokenAddress,
          tokenType: solution.tokenType,
          tokenSubID: solution.tokenSubID,
          value: 1n,
          recipientAddress: solution.recipientAddress,
        },
      ],
    }
  }
}

const defaultGreedySolver = new GreedySolver()

/**
 * Get spending solution.
 * @param solution - Solution input
 * @returns Output solution
 */
const getSpendingSolution = (solution: SpendingSolutionInput): OutputSolution | undefined => {
  return defaultGreedySolver.solve({ kind: SolverKind.Greedy, solution }) as
    | OutputSolution
    | undefined
}

export { getSpendingSolution, GreedySolver, NFTNotOwnedOrSpentError, SpendingSolution }
export type { Input, SpendingSolutionInput }
