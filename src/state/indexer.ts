import type { UTXO, UTXOState, SerializedUTXOState } from './models'
import type { NullifierEvent } from './events'
import {
  createEmptyState,
  addUTXO as addUTXOToState,
  addUTXOs as addUTXOsToState,
  getUTXO as getUTXOFromState,
  getSpendableUTXOs as getSpendableUTXOsFromState,
  isSpent as isSpentInState,
  setSyncedBlock as setSyncedBlockInState,
  serializeState,
  deserializeState
} from './index'
import { applyNullifierEvents as applyNullifierEventsToState, handleReorg as handleReorgInState } from './events'

/**
 * NullifierIndexer manages UTXO state and tracks nullifier spends.
 *
 * This class encapsulates all UTXO state management and provides a clean API
 * for the scanner to feed events downstream without managing state directly.
 *
 * @example
 * // Initialize
 * const indexer = new NullifierIndexer()
 *
 * // Scanner feeds events downstream
 * const events = await scanner.getNullifierEvents(fromBlock, toBlock)
 * indexer.processNullifierEvents(events)
 *
 * // Query spendable UTXOs
 * const spendable = indexer.getSpendableUTXOs('0xtoken...')
 *
 * // Handle reorg
 * indexer.handleReorg(reorgBlockNumber)
 */
export class NullifierIndexer {
  private state: UTXOState

  /**
   * Creates a new NullifierIndexer instance.
   *
   * @param initialState - Optional initial state to restore from
   *
   * @example
   * // Create fresh indexer
   * const indexer = new NullifierIndexer()
   *
   * // Restore from saved state
   * const saved = await db.loadState()
   * const indexer = new NullifierIndexer(saved)
   */
  constructor(initialState?: UTXOState) {
    this.state = initialState ?? createEmptyState()
  }

  /**
   * Processes nullifier events from the scanner.
   * Marks corresponding UTXOs as spent and updates the nullifier index.
   *
   * The scanner should call this method whenever it detects nullifier events
   * on-chain, without worrying about state management.
   *
   * @param events - Nullifier events from the blockchain scanner
   *
   * @example
   * // Scanner feeds events downstream
   * const events = await scanner.getNullifierEvents(fromBlock, toBlock)
   * indexer.processNullifierEvents(events)
   */
  processNullifierEvents(events: NullifierEvent[]): void {
    this.state = applyNullifierEventsToState(this.state, events)
  }

  /**
   * Adds a single UTXO to the indexer.
   *
   * @param utxo - UTXO to add
   *
   * @example
   * const utxo = {
   *   commitment: '0xabc...',
   *   nullifier: '0xdef...',
   *   value: 1000n,
   *   token: '0xtoken...',
   *   // ... other fields
   * }
   * indexer.addUTXO(utxo)
   */
  addUTXO(utxo: UTXO): void {
    this.state = addUTXOToState(this.state, utxo)
  }

  /**
   * Adds multiple UTXOs to the indexer in batch.
   *
   * @param utxos - Array of UTXOs to add
   *
   * @example
   * const utxos = await scanner.getNewCommitments(fromBlock, toBlock)
   * indexer.addUTXOs(utxos)
   */
  addUTXOs(utxos: UTXO[]): void {
    this.state = addUTXOsToState(this.state, utxos)
  }

  /**
   * Handles a blockchain reorganization by reverting UTXOs spent after the reorg point.
   *
   * When the scanner detects a reorg, it should call this method to unwind
   * any nullifiers that were revealed in blocks that got rolled back.
   *
   * @param reorgBlockNumber - Block number where reorg occurred (exclusive -
   *                           UTXOs spent AT this block are kept,
   *                           UTXOs spent AFTER are reverted)
   *
   * @example
   * // Scanner detects reorg to block 1000
   * indexer.handleReorg(1000n)
   *
   * // Any UTXOs spent in blocks > 1000 are now marked unspent
   */
  handleReorg(reorgBlockNumber: bigint): void {
    this.state = handleReorgInState(this.state, reorgBlockNumber)
  }

  /**
   * Checks if a nullifier has been spent.
   *
   * @param nullifier - Nullifier to check
   * @returns True if the nullifier is in the index (spent), false otherwise
   *
   * @example
   * if (indexer.isSpent('0xnullifier...')) {
   *   console.log('This UTXO has already been spent')
   * }
   */
  isSpent(nullifier: string): boolean {
    return isSpentInState(this.state, nullifier)
  }

  /**
   * Gets a UTXO by its commitment.
   *
   * @param commitment - Commitment to search for
   * @returns UTXO if found, undefined otherwise
   *
   * @example
   * const utxo = indexer.getUTXO('0xcommitment...')
   * if (utxo && !utxo.spent) {
   *   console.log('UTXO is spendable')
   * }
   */
  getUTXO(commitment: string): UTXO | undefined {
    return getUTXOFromState(this.state, commitment)
  }

  /**
   * Gets all spendable (unspent) UTXOs, optionally filtered by token.
   *
   * @param token - Optional token address to filter by
   * @returns Array of spendable UTXOs
   *
   * @example
   * // Get all spendable UTXOs
   * const allSpendable = indexer.getSpendableUTXOs()
   *
   * // Get spendable UTXOs for a specific token
   * const tokenUTXOs = indexer.getSpendableUTXOs('0xtoken...')
   *
   * // Feed to spending solver
   * const solution = calculateSolution({
   *   inputs: tokenUTXOs,
   *   amount: 1000n,
   *   // ...
   * })
   */
  getSpendableUTXOs(token?: string): UTXO[] {
    return getSpendableUTXOsFromState(this.state, token)
  }

  /**
   * Gets all UTXOs (spent and unspent).
   *
   * @returns Array of all UTXOs
   */
  getAllUTXOs(): UTXO[] {
    return [...this.state.utxos]
  }

  /**
   * Gets the current synced block number.
   *
   * @returns Highest block number that has been synced
   */
  getSyncedBlock(): bigint {
    return this.state.syncedBlock
  }

  /**
   * Sets the synced block number.
   *
   * @param blockNumber - Block number to set
   *
   * @example
   * // Scanner updates after processing events
   * indexer.setSyncedBlock(latestBlock)
   */
  setSyncedBlock(blockNumber: bigint): void {
    this.state = setSyncedBlockInState(this.state, blockNumber)
  }

  /**
   * Gets the total count of UTXOs.
   *
   * @returns Total number of UTXOs (spent + unspent)
   */
  getUTXOCount(): number {
    return this.state.utxos.length
  }

  /**
   * Gets the count of nullifiers in the index.
   *
   * @returns Number of spent nullifiers tracked
   */
  getNullifierCount(): number {
    return this.state.nullifiers.size
  }

  /**
   * Serializes the indexer state for persistence.
   *
   * @returns Serialized state that can be saved to disk/database
   *
   * @example
   * // Save state
   * const serialized = indexer.serialize()
   * await db.save('utxo-state', JSON.stringify(serialized))
   *
   * // Restore later
   * const saved = JSON.parse(await db.load('utxo-state'))
   * const indexer = NullifierIndexer.deserialize(saved)
   */
  serialize(): SerializedUTXOState {
    return serializeState(this.state)
  }

  /**
   * Creates a NullifierIndexer from serialized state.
   *
   * @param serialized - Serialized state to restore
   * @returns New NullifierIndexer instance with restored state
   *
   * @example
   * const saved = JSON.parse(await db.load('utxo-state'))
   * const indexer = NullifierIndexer.deserialize(saved)
   */
  static deserialize(serialized: SerializedUTXOState): NullifierIndexer {
    return new NullifierIndexer(deserializeState(serialized))
  }

  /**
   * Gets a snapshot of the current state (immutable copy).
   *
   * Use this if you need to read the state without mutating it,
   * or for debugging/logging purposes.
   *
   * @returns Immutable copy of current state
   *
   * @example
   * const snapshot = indexer.getState()
   * console.log('Synced to block:', snapshot.syncedBlock)
   * console.log('Total UTXOs:', snapshot.utxos.length)
   */
  getState(): UTXOState {
    return {
      utxos: [...this.state.utxos],
      nullifiers: new Set(this.state.nullifiers),
      syncedBlock: this.state.syncedBlock
    }
  }

  /**
   * Clears all state (useful for testing or resetting).
   *
   * @example
   * indexer.clear()
   */
  clear(): void {
    this.state = createEmptyState()
  }
}
