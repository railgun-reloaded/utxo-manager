import { MAX_INPUTS, isValidInputOutputCount } from '../nullifiers'
import { selectInputsForTarget } from '../selection'
import {
  filterZeroUTXOs,
  sortUTXOsByAscendingValue,
  sortUTXOsByDescendingValue,
} from '../utxos'

import { BaseSolver } from './base'
import type { SolveParams, SolveResult, TokenIdentity } from './types'
import { SolverKind, SpendingSolution, TokenType } from './types'

/**
 * UTXO input to the greedy solver.
 */
type Input = TokenIdentity & {
  commitmentIndex: bigint
  treeNumber: bigint
  value: bigint
}

/**
 * Output note emitted by the greedy solver — token identity plus the amount
 * and the receiving address.
 */
type OutputNote = TokenIdentity & {
  value: bigint
  recipientAddress: string
}

/**
 * Greedy solver result: selected inputs and the outputs they produce.
 */
type OutputSolution = {
  inputs: Input[]
  outputs: OutputNote[]
}

/**
 * Greedy solver input contract.
 */
type SpendingSolutionInput = TokenIdentity & {
  changeAddress: string
  recipientAddress: string
  inputs: Input[]
  amount: bigint
  type?: SpendingSolution
}

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

    const targetAddress = solution.tokenAddress.toLowerCase()
    const targetSubID = solution.tokenSubID.toLowerCase()
    const identityFiltered = solution.inputs.filter(
      (input) =>
        input.tokenAddress.toLowerCase() === targetAddress &&
        input.tokenType === solution.tokenType &&
        input.tokenSubID.toLowerCase() === targetSubID
    )

    if (solution.tokenType === TokenType.ERC20) {
      return this.solveERC20(solution, identityFiltered)
    }

    if (solution.tokenType === TokenType.ERC721) {
      return this.solveERC721(solution, identityFiltered)
    }

    throw new Error(`Unsupported token type: ${String(solution.tokenType)}`)
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
   * Single-input selection for ERC721. `amount` must be `1n`, the wallet
   * must own a matching unspent input, and that input must itself have
   * value `1n` per the RAILGUN protocol invariant.
   * @param solution - Spending solution input.
   * @param identityFiltered - Inputs filtered to the target token identity.
   * @returns Output solution with one input and one output.
   */
  private solveERC721 (
    solution: SpendingSolutionInput,
    identityFiltered: Input[]
  ): OutputSolution {
    if (solution.amount !== 1n) {
      throw new Error(`ERC721 spend amount must be 1, got ${solution.amount}`)
    }

    if (identityFiltered.length === 0) {
      throw new Error(
        `NFT not owned or already spent: collection=${solution.tokenAddress}, tokenId=${solution.tokenSubID}`
      )
    }

    const match = identityFiltered[0]
    if (!match) {
      throw new Error('ERC721 input missing after length check')
    }

    if (match.value !== 1n) {
      throw new Error(`ERC721 input must have value of 1, got ${match.value}`)
    }

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

export { getSpendingSolution, GreedySolver }
export type { Input, OutputNote, OutputSolution, SpendingSolutionInput }
