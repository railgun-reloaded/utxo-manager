import type { SpendingSolution } from "../models"

type SpendRecipient = {
  tokenAddress: string,
  railgunAddress: string,
  amount: bigint
}

type SpendIntent = {
  // tokenAddress: string,
  changeAddress: string,
  recipients: SpendRecipient[]
  type: SpendingSolution
}

type SpendInput = {
  tokenAddress: string,
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

type SpendTreeSolutions = Record<string, SpendTreeOutput>;

type BadSpendOutput = {
  error: boolean;
  intent: SpendIntent;
}

export type { SpendIntent, SpendRecipient, SpendInput, SpendTransaction, SpendTreeOutput, SpendTreeSolutions, BadSpendOutput };