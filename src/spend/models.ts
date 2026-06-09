import type { SpendingSolution, TokenType } from '../models'

type SpendRecipient = {
  tokenAddress: string,
  tokenType: TokenType,
  tokenSubID: string,
  railgunAddress: string,
  amount: bigint
}

type SpendIntent = {
  changeAddress: string,
  recipients: SpendRecipient[]
  type: SpendingSolution
}

type SpendInput = {
  tokenAddress: string,
  tokenType: TokenType,
  tokenSubID: string,
  treeNumber: bigint,
  leafIndex: bigint,
  value: bigint
}

type SpendTransaction = {
  value: bigint,
  railgunAddress: string
}

type SpendTreeOutput = {
  inputs: SpendInput[],
  outputs: SpendTransaction[]
}

type SpendTreeSolutions = Record<string, SpendTreeOutput>

type BadSpendOutput = {
  error: boolean;
  intent: SpendIntent;
}

export type { SpendIntent, SpendRecipient, SpendInput, SpendTransaction, SpendTreeOutput, SpendTreeSolutions, BadSpendOutput }
