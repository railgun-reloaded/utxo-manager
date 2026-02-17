/**
 * Represents a UTXO (Unspent Transaction Output) in the RAILGUN system.
 */
interface UTXO {
  /** The commitment hash for this UTXO */
  commitment: string
  /** The nullifier hash (revealed when spent) */
  nullifier: string
  /** Merkle tree number where this UTXO is stored */
  treeNumber: bigint
  /** Leaf index within the merkle tree */
  leafIndex: bigint
  /** Token address */
  token: string
  /** UTXO value */
  value: bigint
  /** Block number where this UTXO was created */
  blockNumber: bigint
  /** Whether this UTXO has been spent */
  spent: boolean
  /** Transaction ID where this UTXO was spent (if spent) */
  spentTxid?: string
  /** Block number where this UTXO was spent (if spent) */
  spentBlockNumber?: bigint
}

/**
 * Represents the complete state of UTXOs.
 */
interface UTXOState {
  /** List of all UTXOs */
  utxos: UTXO[]
  /** Set of all known nullifiers (for quick lookup) */
  nullifiers: Set<string>
  /** Highest block number that has been synced */
  syncedBlock: bigint
}

/**
 * Serialized version of UTXO for storage/transmission.
 * BigInt fields are converted to strings.
 */
interface SerializedUTXO {
  commitment: string
  nullifier: string
  treeNumber: string
  leafIndex: string
  token: string
  value: string
  blockNumber: string
  spent: boolean
  spentTxid?: string
  spentBlockNumber?: string
}

/**
 * Serialized version of UTXOState for storage/transmission.
 */
interface SerializedUTXOState {
  utxos: SerializedUTXO[]
  nullifiers: string[]
  syncedBlock: string
}

export type { UTXO, UTXOState, SerializedUTXO, SerializedUTXOState }
