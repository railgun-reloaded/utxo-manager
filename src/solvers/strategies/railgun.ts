import { MAX_INPUTS, isValidInputOutputCount } from '../nullifiers'
import { selectInputsForTarget } from '../selection'
import { filterZeroUTXOs, sortUTXOsByAscendingValue, sortUTXOsByDescendingValue } from '../utxos'

import { BaseSolver } from './base'
import type { SolveParams, SolveResult, TokenIdentity } from './types'
import { SolverKind, SpendingSolution, TokenType } from './types'

/**
 * A recipient of a railgun spend: token identity, destination address, and
 * the amount to send.
 */
type SpendRecipient = TokenIdentity & {
  railgunAddress: string
  amount: bigint
}

/**
 * Multi-recipient spend description. Each recipient is paid from the inputs
 * matching its token identity.
 */
type SpendIntent = {
  changeAddress: string
  recipients: SpendRecipient[]
  type: SpendingSolution
}

/**
 * UTXO input to the railgun solver.
 */
type SpendInput = TokenIdentity & {
  treeNumber: bigint
  leafIndex: bigint
  value: bigint
}

/**
 * Output emitted by the railgun solver — amount + destination address.
 * Token identity is implied by the enclosing `SpendTreeOutput`'s inputs.
 */
type SpendTransaction = {
  value: bigint
  railgunAddress: string
}

/**
 * Per-tree solution: selected inputs and the outputs they produce.
 */
type SpendTreeOutput = {
  inputs: SpendInput[]
  outputs: SpendTransaction[]
}

/**
 * Composite identity key for grouping inputs and recipients by token.
 * `tokenAddress` and `tokenSubID` are lowercased so identities that differ
 * only by casing collapse into one group.
 * @param identity - Token identity triple.
 * @returns Normalized composite key.
 */
function tokenIdentityKey (identity: TokenIdentity): string {
  return `${identity.tokenAddress.toLowerCase()}:${identity.tokenType}:${identity.tokenSubID.toLowerCase()}`
}

/**
 * Recipients and inputs that share one token identity.
 */
type IdentityGroup = {
  tokenType: TokenType
  recipients: SpendRecipient[]
  inputs: SpendInput[]
}

/**
 * Bucket recipients and inputs by their full token identity triple.
 * @param intent - Spending intent.
 * @param utxos - Available UTXOs.
 * @returns One group per distinct identity present in the intent.
 */
function groupByIdentity (intent: SpendIntent, utxos: SpendInput[]): IdentityGroup[] {
  const byKey = new Map<string, IdentityGroup>()

  for (const recipient of intent.recipients) {
    const key = tokenIdentityKey(recipient)
    const existing = byKey.get(key)
    if (existing) {
      existing.recipients.push(recipient)
    } else {
      byKey.set(key, { tokenType: recipient.tokenType, recipients: [recipient], inputs: [] })
    }
  }

  for (const utxo of utxos) {
    const group = byKey.get(tokenIdentityKey(utxo))
    if (group) group.inputs.push(utxo)
  }

  return Array.from(byKey.values())
}

/**
 * Halve recipient amounts into two parallel intents.
 * @param recipients - Recipients to split.
 * @returns Half and remainder recipient lists (same recipients, halved amounts).
 */
function splitRecipients (
  recipients: SpendRecipient[]
): { half: SpendRecipient[]; remainder: SpendRecipient[] } {
  const half: SpendRecipient[] = []
  const remainder: SpendRecipient[] = []

  for (const recipient of recipients) {
    const halved = recipient.amount / 2n
    half.push({ ...recipient, amount: halved })
    remainder.push({ ...recipient, amount: recipient.amount - halved })
  }

  return { half, remainder }
}

/**
 * Railgun spend solver (multi-recipient, single-token per solution).
 */
class RailgunSolver extends BaseSolver<SpendInput, SpendTransaction, SpendTreeOutput> {
  /** Solver name. */
  readonly name = SolverKind.Railgun

  /**
   * Solve a spend intent. Groups recipients and inputs by complete token
   * identity, then dispatches each group to the correct path: ERC721 has
   * its own short-circuit, ERC20 tries a single-tree solution first and
   * falls back to a recursive split if the spend can't be satisfied from
   * one tree.
   * @param params - Solve parameters.
   * @returns Per-group spend solutions.
   */
  solve (params: SolveParams): SolveResult {
    if (params.kind !== SolverKind.Railgun) {
      throw new Error(`RailgunSolver expects params.kind === '${SolverKind.Railgun}'`)
    }

    const { intent, utxos } = params
    const groups = groupByIdentity(intent, utxos)

    return groups.flatMap((group) => {
      if (group.tokenType === TokenType.ERC721) {
        return [this.solveERC721Group(group)]
      }

      if (group.tokenType !== TokenType.ERC20) {
        throw new Error(`Unsupported token type: ${String(group.tokenType)}`)
      }

      const simple = this.solveERC20Group(intent, group)
      if (simple) return [simple]

      return this.solveComplexERC20Group(intent, group)
    })
  }

  /**
   * ERC721 path. Validates the protocol invariants, locates the matching
   * unspent input, and emits a single-input single-output solution.
   * @param group - Identity group (ERC721).
   * @returns Tree output with one input and one output.
   */
  private solveERC721Group (group: IdentityGroup): SpendTreeOutput {
    if (group.recipients.length !== 1) {
      throw new Error(
        `ERC721 group must have exactly one recipient, got ${group.recipients.length}`
      )
    }

    const recipient = group.recipients[0]
    if (!recipient) {
      throw new Error('ERC721 recipient missing after length check')
    }

    if (recipient.amount !== 1n) {
      throw new Error(`ERC721 recipient amount must be 1, got ${recipient.amount}`)
    }

    if (group.inputs.length === 0) {
      throw new Error(
        `NFT not owned or already spent: collection=${recipient.tokenAddress}, tokenId=${recipient.tokenSubID}`
      )
    }

    const match = group.inputs[0]
    if (!match) {
      throw new Error('ERC721 input missing after length check')
    }

    if (match.value !== 1n) {
      throw new Error(`ERC721 input must have value of 1, got ${match.value}`)
    }

    return {
      inputs: [match],
      outputs: [
        { value: 1n, railgunAddress: recipient.railgunAddress },
      ],
    }
  }

  /**
   * ERC20 simple path: try to satisfy the group's total from a single tree.
   * @param intent - Spending intent (for change address and sort mode).
   * @param group - Identity group (ERC20).
   * @returns Tree output if a single tree can cover the amount, otherwise undefined.
   */
  private solveERC20Group (
    intent: SpendIntent,
    group: IdentityGroup
  ): SpendTreeOutput | undefined {
    const filtered = filterZeroUTXOs(group.inputs)
    if (filtered.length === 0) return undefined

    const sortFn =
      intent.type === SpendingSolution.Consolidation
        ? sortUTXOsByDescendingValue
        : sortUTXOsByAscendingValue
    const preferHigherEfficiency = intent.type === SpendingSolution.Consolidation

    const { availableTrees, sortedInputs } = this.getTreeInputs(filtered, sortFn)
    const treeSolutions: SpendTreeOutput[] = []
    const intentTotal = group.recipients.reduce((acc, r) => acc + r.amount, 0n)

    Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
      const treeValue = availableTrees[treeNumber] ?? 0n
      if (treeValue < intentTotal) return

      const selection = selectInputsForTarget(treeInputs, intentTotal, MAX_INPUTS, sortFn)
      if (!selection) return

      const treeOutput: SpendTreeOutput = {
        inputs: selection.inputs,
        outputs: group.recipients.map((r) => ({ value: r.amount, railgunAddress: r.railgunAddress })),
      }

      const change = selection.total - intentTotal
      if (change > 0n) {
        treeOutput.outputs.push({ value: change, railgunAddress: intent.changeAddress })
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
   * ERC20 complex path: split recipient amounts in half and try each half
   * independently. Subtracts inputs used by the first half before solving
   * the second. Recurses on the remainder when its simple solve fails.
   * @param intent - Spending intent.
   * @param group - Identity group (ERC20).
   * @returns Zero, one, or two tree outputs covering the original group.
   */
  private solveComplexERC20Group (
    intent: SpendIntent,
    group: IdentityGroup
  ): SpendTreeOutput[] {
    const { half, remainder } = splitRecipients(group.recipients)

    const firstGroup: IdentityGroup = { ...group, recipients: half }
    const first = this.solveERC20Group(intent, firstGroup)
    if (!first) return []

    const usedKeys = new Set<string>()
    for (const input of first.inputs) {
      usedKeys.add(`${input.leafIndex}:${input.treeNumber}`)
    }
    const remainingInputs = group.inputs.filter(
      (u) => !usedKeys.has(`${u.leafIndex}:${u.treeNumber}`)
    )

    const secondGroup: IdentityGroup = { ...group, recipients: remainder, inputs: remainingInputs }
    const secondSimple = this.solveERC20Group(intent, secondGroup)
    if (secondSimple) return [first, secondSimple]

    return [first, ...this.solveComplexERC20Group(intent, secondGroup)]
  }
}

const defaultRailgunSolver = new RailgunSolver()

/**
 * Calculate solutions for a spend intent.
 * @param intent - Spending intent.
 * @param utxos - Available UTXOs.
 * @returns One or more per-group spend solutions.
 */
const calculateSolution = (
  intent: SpendIntent,
  utxos: SpendInput[]
): SpendTreeOutput[] => {
  const result = defaultRailgunSolver.solve({
    kind: SolverKind.Railgun,
    intent,
    utxos,
  })

  if (!result || !Array.isArray(result)) {
    return []
  }

  return result
}

export { calculateSolution, RailgunSolver }
export type { SpendInput, SpendIntent, SpendRecipient, SpendTransaction, SpendTreeOutput }
