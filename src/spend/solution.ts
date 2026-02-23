import { BaseSolver } from '../base-solver'
import type { SolveParams, SolveResult } from '../interfaces'
import { SpendingSolution } from '../models'
import { MAX_INPUTS, isValidInputOutputCount } from '../solutions/nullifiers'
import { selectInputsForTarget } from '../solutions/selection'
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
  readonly name = 'railgun'

  /**
   * Solve spending intent.
   * @param params - Solve parameters
   * @returns Solution result
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== 'railgun') {
      throw new Error("RailgunSolver expects params.kind === 'railgun'")
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
        solutions.push({ error: true, intent })
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

      const firstSolutions = this.solve({
        kind: 'railgun',
        intent: splitIntent,
        utxos,
        isComplex: true,
      }) as SpendTreeOutput[]

      const usedInputs = new Set<string>()
      firstSolutions.forEach((solutionPart) => {
        solutionPart.inputs.forEach((input) => {
          usedInputs.add(`${input.leafIndex}:${input.treeNumber}`)
        })
        solutions.push(solutionPart)
      })

      const remainingUtxos = utxos.filter(
        (spend) => !usedInputs.has(`${spend.leafIndex}:${spend.treeNumber}`)
      )
      const secondSolutions = this.solve({
        kind: 'railgun',
        intent: remainderIntent,
        utxos: remainingUtxos,
        isComplex: true,
      }) as SpendTreeOutput[]

      secondSolutions.forEach((solutionPart) => {
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
  return defaultRailgunSolver.solve({
    kind: 'railgun',
    intent,
    utxos,
    isComplex,
  }) as SpendTreeOutput[]
}

export { calculateSolution, RailgunSolver }
