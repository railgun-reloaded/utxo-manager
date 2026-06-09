/**
 * Identifies a single NFT by its collection address and token ID.
 */
type NFTIdentity = {
  collection: string
  tokenId: string
}

/**
 * Thrown when an ERC721 spend has no matching unspent input.
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
 * Find the unspent input matching an NFT identity. Callers must pre-filter
 * `inputs` to ERC721 candidates.
 * @param inputs - Candidate inputs.
 * @param identity - Target NFT identity.
 * @returns The matching input.
 * @throws {NFTNotOwnedOrSpentError} When no input matches.
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
