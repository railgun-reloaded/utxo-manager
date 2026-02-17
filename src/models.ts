enum SpendingSolution {
  Simple, // takes a set of utxo, outputs simplest solution.
  Advanced, // secondary flags passed as options.
  Consolidation, // X -> 1 outputs.
  TreeSweep
}
type TokenData = {
  // tokenAddress: string, // address left padded 32 bytes
  // tokenSubID: bigint,   // uint256
  value: bigint; // uint120 left padded 32 bytes
  recipientAddress: string;

}
type Input = {
  commitmentIndex: bigint;
  treeNumber: bigint;
  value: bigint;
}
type OutputSolution = {
  inputs: Input[]; // matched with the inputs by index.
  outputs: TokenData[]; // also has an expected to address
}
// type UTXO = {
//   tokenAddress: string,
//   inputs: Input[]
//   outputs: TokenData[]
// }
type SpendingSolutionInput = {
  // to whom
  changeAddress: string,
  recipientAddress: string;
  inputs: Input[]; // list of utxo for desired token, not needed here. wallet shall pass in and handle separation of notes across tokens.
  amount: bigint;
  type?: SpendingSolution;
}

export { SpendingSolution, type Input, type OutputSolution, type SpendingSolutionInput }
