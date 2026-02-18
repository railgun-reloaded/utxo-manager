export enum SpendingSolution {
  Simple,// takes a set of utxo, outputs simplest solution.
  Consolidation,// X -> 1 outputs.   
}
export type TokenData = {
  // tokenAddress: string, // address left padded 32 bytes
  // tokenSubID: bigint,   // uint256
  value: bigint; // uint120 left padded 32 bytes
  recipientAddress: string;

};
export type Input = {
  commitmentIndex: bigint;
  treeNumber: bigint;
  value: bigint;
};
export type OutputSolution = {
  inputs: Input[]; // matched with the inputs by index.
  outputs: TokenData[]; // also has an expected to address
};
export type SpendingSolutionGroup = {
  spendingTree: number;
  utxos: Input[];
  tokenOutputs: TokenData[];
  unshieldValue: bigint;
  tokenData: TokenData;
};
// type UTXO = {
//   tokenAddress: string,
//   inputs: Input[]
//   outputs: TokenData[]
// }
export type SpendingSolutionInput = {
  // to whom
  changeAddress: string,
  recipientAddress: string;
  inputs: Input[]; // list of utxo for desired token, not needed here. wallet shall pass in and handle separation of notes across tokens.
  amount: bigint;
  type?: SpendingSolution;
};
