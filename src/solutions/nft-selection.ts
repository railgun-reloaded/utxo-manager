/**
 * Identity payload carried on `NFTNotOwnedOrSpentError`. Lets callers report
 * the missing NFT without re-deriving the identity from the spend intent.
 */
type NFTIdentity = {
  collection: string
  tokenId: string
}

/**
 * Thrown when an ERC721 spend targets a token the wallet does not have an
 * unspent input for — either never owned, already spent, or selected from
 * the wrong tree.
 */
class NFTNotOwnedOrSpentError extends Error {
  /** Collection address (token contract). */
  readonly collection: string
  /** Token ID (32-byte sub-identifier as 0x-prefixed hex). */
  readonly tokenId: string

  /**
   * Construct an `NFTNotOwnedOrSpentError` for a specific NFT identity.
   * @param identity - Collection + token ID for the missing NFT.
   */
  constructor (identity: NFTIdentity) {
    super(
      `NFT not owned or already spent: collection=${identity.collection}, tokenId=${identity.tokenId}`
    )
    this.name = 'NFTNotOwnedOrSpentError'
    this.collection = identity.collection
    this.tokenId = identity.tokenId
  }
}

/**
 * ERC721-specific input shape required for the short-circuit lookup.
 */
type NFTSelectableInput = {
  tokenAddress: string
  tokenSubID: string
  value: bigint
}

/**
 * Select the single matching unspent input for an ERC721 spend. ERC721 notes
 * always have `value: 1n`, so selection collapses to "find the one note whose
 * identity matches, or fail." Throws `NFTNotOwnedOrSpentError` when no input
 * matches the requested `(collection, tokenId)` pair.
 *
 * Callers must pre-filter `inputs` to the relevant `tokenType` (or guarantee
 * none of the inputs collide on `(tokenAddress, tokenSubID)` across types) —
 * this helper assumes every input in `inputs` is an ERC721 candidate.
 * @param inputs - Candidate ERC721 inputs (already nullifier-filtered to unspent).
 * @param identity - Target NFT identity to select.
 * @returns The single matching input.
 * @throws {NFTNotOwnedOrSpentError} When no input matches the identity.
 */
function selectNFTInput<T extends NFTSelectableInput> (
  inputs: T[],
  identity: NFTIdentity
): T {
  const match = inputs.find(
    (input) =>
      input.tokenAddress === identity.collection &&
      input.tokenSubID === identity.tokenId
  )
  if (!match) {
    throw new NFTNotOwnedOrSpentError(identity)
  }
  return match
}

export { NFTNotOwnedOrSpentError, selectNFTInput }
export type { NFTIdentity, NFTSelectableInput }
