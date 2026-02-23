import { BaseSolver } from './base-solver'
import type { SolveParams, SolveResult } from './interfaces'
import type { Input, OutputSolution, SpendingSolutionInput } from './models'
import {

  SpendingSolution

} from './models'
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
  /**
   *
   */
  readonly name = 'greedy'

  /**
   *
   * @param params
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== 'greedy') {
      throw new Error("GreedySolver expects params.kind === 'greedy'")
    }

    const solution = params.solution
    if (!solution.type) {
      solution.type = SpendingSolution.Simple
    }

    if (solution.amount <= 0n) return undefined

    const filteredInputs = filterZeroUTXOs(solution.inputs)
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
          value: solution.amount,
          recipientAddress: solution.recipientAddress,
        },
      ]

      const change = selection.total - solution.amount
      if (change > 0n) {
        outputs.push({
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
}

const defaultGreedySolver = new GreedySolver()

/**
 *
 * @param solution
 */
const getSpendingSolution = (solution: SpendingSolutionInput): OutputSolution | undefined => {
  return defaultGreedySolver.solve({ kind: 'greedy', solution }) as
    | OutputSolution
    | undefined
}

export { getSpendingSolution, SpendingSolution, GreedySolver }
export type { SpendingSolutionInput, Input }
