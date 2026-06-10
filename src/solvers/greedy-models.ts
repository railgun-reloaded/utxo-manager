import type { SpendingSolution, TokenIdentity } from './types'

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

export type { Input, OutputNote, OutputSolution, SpendingSolutionInput }
