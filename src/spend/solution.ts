import { BaseSolver } from '../base-solver'
import type { SolveParams, SolveResult } from '../interfaces'
import { SolverKind } from '../interfaces'
import { SpendingSolution, TokenType, tokenIdentityKey } from '../models'
import { NFTNotOwnedOrSpentError, selectNFTInput } from '../solutions/nft-selection'
import { MAX_INPUTS, isValidInputOutputCount } from '../solutions/nullifiers'
import { selectInputsForTarget } from '../solutions/selection'
import { filterZeroUTXOs, sortUTXOsByAscendingValue, sortUTXOsByDescendingValue } from '../solutions/utxos'

import type {
  BadSpendOutput,
  SpendInput,
  SpendIntent,
  SpendRecipient,
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
   * Solve spending intent. Inputs and recipients are grouped by complete
   * token identity `(tokenAddress, tokenType, tokenSubID)`.
   * @param params - Solve parameters
   * @returns Solution result
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== SolverKind.Railgun) {
      throw new Error(`RailgunSolver expects params.kind === '${SolverKind.Railgun}'`)
    }

    const { intent, utxos } = params
    const solutions: (SpendTreeOutput | BadSpendOutput)[] = []

    const recipientsByIdentity = new Map<string, SpendRecipient[]>()
    intent.recipients.forEach((recipient) => {
      const key = tokenIdentityKey(recipient)
      const bucket = recipientsByIdentity.get(key)
      if (bucket) {
        bucket.push(recipient)
      } else {
        recipientsByIdentity.set(key, [recipient])
      }
    })

    recipientsByIdentity.forEach((recipients, identityKey) => {
      const inputs = utxos.filter((utxo) => tokenIdentityKey(utxo) === identityKey)
      const reference = recipients[0]
      if (!reference) return

      if (reference.tokenType === TokenType.ERC20) {
        if (inputs.length === 0) {
          solutions.push({ error: true, intent })
          return
        }
        const result = this.solveERC20Group(intent, recipients, inputs)
        solutions.push(result ?? { error: true, intent })
        return
      }

      if (reference.tokenType === TokenType.ERC721) {
        const result = this.solveERC721Group(recipients, inputs)
        solutions.push(result)
        return
      }

      throw new Error(`Unsupported token type: ${String(reference.tokenType)}`)
    })

    return this.resolveComplexSolutions(utxos, solutions)
  }

  /**
   * Sum-to-target selection for an ERC20 recipient group.
   * @param intent - Spending intent (provides change address and type).
   * @param recipients - Recipients filtered to a single token identity.
   * @param inputs - Inputs filtered to the same token identity.
   * @returns Best tree solution, or `undefined` if no tree covers the amount.
   */
  private solveERC20Group (
    intent: SpendIntent,
    recipients: SpendRecipient[],
    inputs: SpendInput[]
  ): SpendTreeOutput | undefined {
    const filtered = filterZeroUTXOs(inputs)
    if (filtered.length === 0) return undefined

    const sortFn =
      intent.type === SpendingSolution.Consolidation
        ? sortUTXOsByDescendingValue
        : sortUTXOsByAscendingValue
    const preferHigherEfficiency = intent.type === SpendingSolution.Consolidation

    const { availableTrees, sortedInputs } = this.getTreeInputs(filtered, sortFn)
    const treeSolutions: SpendTreeOutput[] = []

    const intentTotal = recipients.reduce((left, right) => left + right.amount, 0n)

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
        outputs: recipients.map((recipient) => ({
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

    return this.pickBestSolution(
      treeSolutions,
      intent.changeAddress,
      (output) => output.railgunAddress,
      preferHigherEfficiency,
      isValidInputOutputCount
    )
  }

  /**
   * Single-input selection for an ERC721 recipient group. `recipients` must
   * contain exactly one entry with `amount === 1n`.
   * @param recipients - Recipients filtered to a single ERC721 identity.
   * @param inputs - Inputs filtered to the same ERC721 identity.
   * @returns Tree output with one input and one output.
   * @throws {NFTNotOwnedOrSpentError} When no matching unspent input exists.
   * @throws {Error} When the recipient count is not exactly one.
   */
  private solveERC721Group (
    recipients: SpendRecipient[],
    inputs: SpendInput[]
  ): SpendTreeOutput {
    if (recipients.length !== 1) {
      throw new Error(
        `ERC721 group must have exactly one recipient, got ${recipients.length}`
      )
    }

    const recipient = recipients[0]
    if (!recipient) {
      throw new Error('ERC721 recipient missing after length check')
    }

    if (recipient.amount !== 1n) {
      throw new Error(`ERC721 recipient amount must be 1, got ${recipient.amount}`)
    }

    const match = selectNFTInput(inputs, {
      collection: recipient.tokenAddress,
      tokenId: recipient.tokenSubID,
    })

    return {
      inputs: [match],
      outputs: [
        {
          value: 1n,
          railgunAddress: recipient.railgunAddress,
        },
      ],
    }
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
        tokenType: recipient.tokenType,
        tokenSubID: recipient.tokenSubID,
        railgunAddress: recipient.railgunAddress,
        amount: halved,
      })
      remainderIntent.recipients.push({
        tokenAddress: recipient.tokenAddress,
        tokenType: recipient.tokenType,
        tokenSubID: recipient.tokenSubID,
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

export { calculateSolution, NFTNotOwnedOrSpentError, RailgunSolver }
