import { BaseSolver } from '../base-solver'
import type { SolveParams, SolveResult } from '../interfaces'
import { SolverKind } from '../interfaces'
import { SpendingSolution } from '../models'
import { MAX_INPUTS, isValidInputOutputCount } from '../solutions/nullifiers'
import { selectInputsForTarget } from '../solutions/selection'
import { selectBatchesForTarget } from '../solutions/batch-selection'
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

      // Step 1: Try single-tree solutions (existing logic for efficiency)
      Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
        const treeValue = availableTrees[treeNumber] ?? 0n
        if (treeValue < intentTotal) return

        const selection = selectInputsForTarget(
          treeInputs,
          intentTotal,
          MAX_INPUTS,
          sortFn
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
          // Distribute outputs across batches proportionally
          // Each batch gets a proportional share of the recipient outputs based on its value contribution
          const totalBatchValue = batches.reduce((sum, b) => sum + b.total, 0n)
          let remainingToAllocate = intentTotal

          batches.forEach((batch, index) => {
            const isLastBatch = index === batches.length - 1

            const batchOutput: SpendTreeOutput = {
              inputs: batch.inputs,
              outputs: []
            }

            // Calculate this batch's proportional share of the intent
            // For the last batch, use remaining amount to avoid rounding errors
            const batchShare = isLastBatch
              ? remainingToAllocate
              : (batch.total * intentTotal) / totalBatchValue

            // Distribute this batch's share across recipients proportionally
            let batchShareRemaining = batchShare
            filteredRecipients.forEach((recipient, recipientIndex) => {
              const isLastRecipient = recipientIndex === filteredRecipients.length - 1
              const recipientShare = isLastRecipient
                ? batchShareRemaining
                : (recipient.amount * batchShare) / intentTotal

              if (recipientShare > 0n) {
                batchOutput.outputs.push({
                  value: recipientShare,
                  railgunAddress: recipient.railgunAddress,
                })
                batchShareRemaining -= recipientShare
              }
            })

            remainingToAllocate -= batchShare

            // Add change if this batch has excess value
            const batchOutputTotal = batchOutput.outputs.reduce((sum, o) => sum + o.value, 0n)
            const batchChange = batch.total - batchOutputTotal
            if (batchChange > 0n) {
              batchOutput.outputs.push({
                value: batchChange,
                railgunAddress: intent.changeAddress,
              })
            }

            // Validate input/output counts
            if (isValidInputOutputCount(batchOutput.inputs.length, batchOutput.outputs.length)) {
              solutions.push(batchOutput)
            }
          })
        } else {
          // No solution found (single or multi-batch)
          solutions.push({ error: true, intent })
        }
      }
    })

    return this.resolveComplexSolutions(utxos, solutions)
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

  /**
   * Resolve complex solutions by splitting.
   * @param utxos - Available UTXOs
   * @param solutions - Solutions to resolve
   * @returns Resolved solutions
   */
  private resolveComplexSolutions (
    utxos: SpendInput[],
    solutions: (SpendTreeOutput | BadSpendOutput)[]
  ): SpendTreeOutput[] {
    solutions.forEach((solution) => {
      if (!('error' in solution)) return

      const failingIntent = solution.intent
      const { splitIntent, remainderIntent } = this.splitIntent(failingIntent)

      const firstResult = this.solve({
        kind: SolverKind.Railgun,
        intent: splitIntent,
        utxos,
        isComplex: true,
      })

      if (!firstResult || !Array.isArray(firstResult)) {
        return
      }

      const usedInputs = new Set<string>()
      firstResult.forEach((solutionPart) => {
        solutionPart.inputs.forEach((input) => {
          usedInputs.add(`${input.leafIndex}:${input.treeNumber}`)
        })
        solutions.push(solutionPart)
      })

      const remainingUtxos = utxos.filter(
        (spend) => !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`)
      )
      const secondResult = this.solve({
        kind: SolverKind.Railgun,
        intent: remainderIntent,
        utxos: remainingUtxos,
        isComplex: true,
      })

      if (!secondResult || !Array.isArray(secondResult)) {
        return
      }

      secondResult.forEach((solutionPart) => {
        solutions.push(solutionPart)
      })
    })

    return solutions.filter((solution) => !('error' in solution)) as SpendTreeOutput[]
  }

  /**
   * Split intent in half.
   * @param intent - Intent to split
   * @returns Split and remainder intents
   */
  private splitIntent (intent: SpendIntent): { splitIntent: SpendIntent; remainderIntent: SpendIntent } {
    const splitIntent: SpendIntent = {
      changeAddress: intent.changeAddress,
      recipients: [],
      type: intent.type,
    }
    const remainderIntent: SpendIntent = {
      changeAddress: intent.changeAddress,
      recipients: [],
      type: intent.type,
    }

    intent.recipients.forEach((recipient) => {
      const halved = recipient.amount / 2n
      splitIntent.recipients.push({
        tokenAddress: recipient.tokenAddress,
        railgunAddress: recipient.railgunAddress,
        amount: halved,
      })
      remainderIntent.recipients.push({
        tokenAddress: recipient.tokenAddress,
        railgunAddress: recipient.railgunAddress,
        amount: recipient.amount - halved,
      })
    })

    return { splitIntent, remainderIntent }
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
