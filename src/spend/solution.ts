import { BaseSolver } from '../base-solver'
import type { SolveParams, SolveResult } from '../interfaces'
import { SolverKind } from '../interfaces'
import { SpendingSolution } from '../models'
import { selectBatchesForTarget } from '../solutions/batch-selection'
import { MAX_INPUTS, isValidInputOutputCount } from '../solutions/nullifiers'
import { selectOptimalInputs } from '../solutions/optimal-selection'
import { filterZeroUTXOs, sortUTXOsByAscendingValue, sortUTXOsByDescendingValue } from '../solutions/utxos'

import type {
  BadSpendOutput,
  SpendInput,
  SpendIntent,
  SpendTransaction,
  SpendTreeOutput,
} from './models'

/**
 * Railgun spend solver (multi-recipient, single-token per solution).
 */
class RailgunSolver extends BaseSolver<SpendInput, SpendTransaction, SpendTreeOutput> {
  /** Solver name. */
  readonly name = SolverKind.Railgun

  /**
   * Solve spending intent.
   * @param params - Solve parameters
   * @returns Solution result
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== SolverKind.Railgun) {
      throw new Error(`RailgunSolver expects params.kind === '${SolverKind.Railgun}'`)
    }

    const { intent, utxos, isComplex = false } = params
    const rawInputs = this.getSolutionInputs(intent, utxos, isComplex)
    const solutions: (SpendTreeOutput | BadSpendOutput)[] = []

    rawInputs.forEach((raw: SpendInput[]) => {
      const inputs = filterZeroUTXOs(raw)
      if (inputs.length === 0) return

      const sortFn =
        intent.type === SpendingSolution.Consolidation
          ? sortUTXOsByDescendingValue
          : sortUTXOsByAscendingValue
      const preferHigherEfficiency = intent.type === SpendingSolution.Consolidation

      const { availableTrees, sortedInputs } = this.getTreeInputs(inputs, sortFn)
      const treeSolutions: SpendTreeOutput[] = []
      const currentTokenAddress = inputs[0]?.tokenAddress
      const filteredRecipients = intent.recipients.filter(
        (recipient) => recipient.tokenAddress === currentTokenAddress
      )
      const intentTotal = filteredRecipients.reduce((left, right) => left + right.amount, 0n)

      // Step 1: Try optimal single-tree solutions
      Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
        const treeValue = availableTrees[treeNumber] ?? 0n
        if (treeValue < intentTotal) return

        const selection = selectOptimalInputs(
          treeInputs,
          intentTotal,
          MAX_INPUTS
        )
        if (!selection) return

        const treeOutput: SpendTreeOutput = {
          inputs: selection.inputs,
          outputs: filteredRecipients.map((recipient) => ({
            value: recipient.amount,
            railgunAddress: recipient.railgunAddress,
          })),
        }

        const changeAmount = selection.total - intentTotal
        if (changeAmount > 0n) {
          treeOutput.outputs.push({
            value: changeAmount,
            railgunAddress: intent.changeAddress,
          })
        }

        treeSolutions.push(treeOutput)
      })

      const efficientSolution = this.pickBestSolution(
        treeSolutions,
        intent.changeAddress,
        (output) => output.railgunAddress,
        preferHigherEfficiency,
        isValidInputOutputCount
      )

      if (efficientSolution) {
        solutions.push(efficientSolution)
      } else {
        // Step 2: No single-tree solution found, try multi-batch approach
        const batches = selectBatchesForTarget(inputs, intentTotal, MAX_INPUTS, sortFn)

        if (batches.length > 0) {
          // Multi-batch strategy:
          // - Intermediate batches: consolidate all value to changeAddress (self)
          // - Final batch: send to actual recipients + remaining change
          batches.forEach((batch, index) => {
            const isLastBatch = index === batches.length - 1

            const batchOutput: SpendTreeOutput = {
              inputs: batch.inputs,
              outputs: isLastBatch
                ? filteredRecipients.map((recipient) => ({
                  value: recipient.amount,
                  railgunAddress: recipient.railgunAddress,
                }))
                : [
                    // Intermediate batch: consolidate to self
                    {
                      value: batch.total,
                      railgunAddress: intent.changeAddress,
                    }
                  ]
            }

            // Add change to final batch only
            if (isLastBatch) {
              const totalBatchValue = batches.reduce((sum, b) => sum + b.total, 0n)
              const changeAmount = totalBatchValue - intentTotal
              if (changeAmount > 0n) {
                batchOutput.outputs.push({
                  value: changeAmount,
                  railgunAddress: intent.changeAddress,
                })
              }
            }

            // Validate input/output counts
            if (!isValidInputOutputCount(batchOutput.inputs.length, batchOutput.outputs.length)) {
              throw new Error(
                `Invalid batch: ${batchOutput.inputs.length} inputs, ${batchOutput.outputs.length} outputs exceeds circuit limits`
              )
            }

            solutions.push(batchOutput)
          })
        } else {
          // No solution found (single or multi-batch)
          solutions.push({ error: true, intent })
        }
      }
    })

    return solutions.filter((solution) => !('error' in solution)) as SpendTreeOutput[]
  }

  /**
   * Get inputs grouped by token.
   * @param intent - Spending intent
   * @param utxos - Available UTXOs
   * @param _isComplex - Whether complex solution
   * @returns Grouped inputs
   */
  private getSolutionInputs (
    intent: SpendIntent,
    utxos: SpendInput[],
    _isComplex: boolean
  ): SpendInput[][] {
    const tokens = new Set<string>()
    intent.recipients.forEach((recipient) => tokens.add(recipient.tokenAddress))

    const inputs: SpendInput[][] = []
    tokens.forEach((token) => {
      inputs.push(utxos.filter((utxo) => utxo.tokenAddress === token))
    })
    return inputs
  }
}

const defaultRailgunSolver = new RailgunSolver()

/**
 * Calculate solution for spending intent.
 * @param intent - Spending intent
 * @param utxos - Available UTXOs
 * @param isComplex - Whether complex solution
 * @returns Solution outputs
 */
const calculateSolution = (
  intent: SpendIntent,
  utxos: SpendInput[],
  isComplex = false
): SpendTreeOutput[] => {
  const result = defaultRailgunSolver.solve({
    kind: SolverKind.Railgun,
    intent,
    utxos,
    isComplex,
  })

  if (!result || !Array.isArray(result)) {
    return []
  }

  return result
}

export { calculateSolution, RailgunSolver }
