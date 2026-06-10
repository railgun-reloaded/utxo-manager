import type { SpendingSolution, TokenIdentity } from './types'

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
 * Map of tree number to per-tree solution.
 */
type SpendTreeSolutions = Record<string, SpendTreeOutput>

export type { SpendIntent, SpendRecipient, SpendInput, SpendTransaction, SpendTreeOutput, SpendTreeSolutions }
