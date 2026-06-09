/**
 * Token-class enum. Numeric values match the on-chain RAILGUN encoding and
 * are wire-compatible with the wallet-node enum of the same name.
 */
enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
}

enum SpendingSolution {
  Simple, // takes a set of utxo, outputs simplest solution.
  Consolidation, // X -> 1 outputs.
}

type TokenData = {
  tokenAddress: string;
  tokenType: TokenType;
  tokenSubID: string;
  value: bigint; // uint120 left padded 32 bytes
  recipientAddress: string;
}

type Input = {
  commitmentIndex: bigint;
  treeNumber: bigint;
  value: bigint;
  tokenAddress: string;
  tokenType: TokenType;
  tokenSubID: string;
}

type OutputSolution = {
  inputs: Input[]; // matched with the inputs by index.
  outputs: TokenData[]; // also has an expected to address
}

type SpendingSolutionGroup = {
  spendingTree: number;
  utxos: Input[];
  tokenOutputs: TokenData[];
  unshieldValue: bigint;
  tokenData: TokenData;
}

type SpendingSolutionInput = {
  // to whom
  changeAddress: string,
  recipientAddress: string;
  inputs: Input[]; // list of utxo for desired token, not needed here. wallet shall pass in and handle separation of notes across tokens.
  amount: bigint;
  tokenType: TokenType;
  tokenSubID: string;
  tokenAddress: string;
  type?: SpendingSolution;
}

/**
 * Build the composite identity key used to group inputs and recipients by
 * complete token identity. Two entries collapse only when their `tokenAddress`,
 * `tokenType`, and `tokenSubID` all match — for ERC721 this keeps every
 * `(collection, tokenId)` distinct.
 * @param identity - Object carrying the token-identity triple.
 * @param identity.tokenAddress - Token contract address.
 * @param identity.tokenType - Token-class enum.
 * @param identity.tokenSubID - 0x-prefixed lowercase hex sub-identifier.
 * @returns Composite identity key.
 */
function tokenIdentityKey (
  identity: { tokenAddress: string; tokenType: TokenType; tokenSubID: string }
): string {
  return `${identity.tokenAddress}:${identity.tokenType}:${identity.tokenSubID}`
}

export {
  SpendingSolution,
  TokenType,
  tokenIdentityKey,
  type TokenData,
  type Input,
  type OutputSolution,
  type SpendingSolutionGroup,
  type SpendingSolutionInput
}
