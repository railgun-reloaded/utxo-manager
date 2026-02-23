import type { SolveParams, SolveResult, UTXOSolver } from './interfaces'
import { groupInputsByTree } from './solutions/utxos'

type ValueTreeInput = {
  value: bigint
  treeNumber: bigint
}

type SolutionBundle<TInput, TOutput> = {
  inputs: TInput[]
  outputs: TOutput[]
}

/**
 * Base class for shared solver logic.
 */
abstract class BaseSolver<
  TInput extends ValueTreeInput,
  TOutput extends { value: bigint },
  TSolution extends SolutionBundle<TInput, TOutput>
> implements UTXOSolver {
  abstract readonly name: string
  abstract solve (params: SolveParams): SolveResult

  /**
   * Group inputs by tree number and optionally sort each tree's inputs.
   * @param inputs
   * @param sortFn
   */
  protected getTreeInputs (inputs: TInput[], sortFn?: (left: TInput, right: TInput) => number) {
    return groupInputsByTree(inputs, sortFn)
  }

  /**
   * Pick the most efficient solution, preferring larger change when tied.
   * @param treeSolutions
   * @param changeAddress
   * @param getOutputAddress
   * @param preferHigherEfficiency
   * @param isValidSolution
   */
  protected pickBestSolution (
    treeSolutions: TSolution[],
    changeAddress: string,
    getOutputAddress: (output: TOutput) => string,
    preferHigherEfficiency: boolean,
    isValidSolution?: (inputCount: number, outputCount: number) => boolean
  ): TSolution | undefined {
    let bestSolution: TSolution | undefined
    let bestEfficiency = preferHigherEfficiency ? 0 : Infinity

    treeSolutions.forEach((treeSolution) => {
      const inputCount = treeSolution.inputs.length
      const outputCount = treeSolution.outputs.length

      if (isValidSolution && !isValidSolution(inputCount, outputCount)) {
        return
      }

      const efficiency = inputCount / outputCount
      const efficiencyCheck = preferHigherEfficiency
        ? efficiency > bestEfficiency
        : efficiency < bestEfficiency

      if (efficiencyCheck) {
        bestEfficiency = efficiency
        bestSolution = treeSolution
      } else if (efficiency === bestEfficiency && bestSolution) {
        const changeOutput = treeSolution.outputs.find(
          (output) => getOutputAddress(output) === changeAddress
        )
        const currentChange = changeOutput?.value || 0n

        const bestChangeOutput = bestSolution.outputs.find(
          (output) => getOutputAddress(output) === changeAddress
        )
        const bestChange = bestChangeOutput?.value || 0n

        if (currentChange > bestChange) {
          bestSolution = treeSolution
        }
      }
    })

    return bestSolution
  }
}

export { BaseSolver }
