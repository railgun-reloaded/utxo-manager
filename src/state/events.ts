import { bytesToHex } from '@railgun-reloaded/bytes'

import { applyNullifierUpdates } from './nullifiers'
import type { UTXOState } from './types'

/**
 * Represents a nullifier event from the blockchain.
 */
interface NullifierEvent {
  /** The nullifier hash that was revealed */
  nullifier: Uint8Array
  /** Transaction ID where this nullifier was spent */
  txid: string
  /** Block number where the spend occurred */
  blockNumber: bigint
}

/**
 * Applies nullifier events from the scanner to mark UTXOs as spent.
 * @param state - Current UTXO state
 * @param events - Nullifier events from scanner
 * @returns New state with matching UTXOs marked as spent
 * @example
 * const events = [
 *   { nullifier: '0xabc...', txid: '0x123...', blockNumber: 1000n }
 * ]
 * const newState = applyNullifierEvents(state, events)
 */
function applyNullifierEvents (
  state: UTXOState,
  events: NullifierEvent[]
): UTXOState {
  return applyNullifierUpdates(state, events)
}

/**
 * Handles a chain reorganization by reverting spent status for UTXOs
 * that were marked spent in blocks after the reorg point.
 * @param state - Current UTXO state
 * @param reorgBlockNumber - Block number where reorg occurred (exclusive -
 *                           UTXOs spent AT this block are kept,
 *                           UTXOs spent AFTER are reverted)
 * @returns New state with affected UTXOs marked as unspent
 * @example
 * // If chain reorgs at block 1000, revert any UTXOs spent in blocks > 1000
 * const newState = handleReorg(state, 1000n)
 */
function handleReorg (
  state: UTXOState,
  reorgBlockNumber: bigint
): UTXOState {
  // Collect nullifiers to remove (those spent after reorg point)
  const nullifiersToRemove = new Set<string>()

  // Revert UTXOs spent after reorg block
  const newUtxos = state.utxos.map(utxo => {
    if (utxo.spent && utxo.spentBlockNumber && utxo.spentBlockNumber > reorgBlockNumber) {
      // Mark this nullifier for removal from the set
      nullifiersToRemove.add(bytesToHex(utxo.nullifier))

      // Revert the UTXO to unspent (omit optional properties instead of setting to undefined)
      const { spentTxid, spentBlockNumber, ...rest } = utxo
      return {
        ...rest,
        spent: false
      }
    }
    return utxo
  })

  // Remove reverted nullifiers from the set
  const newNullifiers = new Set(state.nullifiers)
  for (const nullifier of nullifiersToRemove) {
    newNullifiers.delete(nullifier)
  }

  return {
    ...state,
    utxos: newUtxos,
    nullifiers: newNullifiers
  }
}

export { applyNullifierEvents, handleReorg }
export type { NullifierEvent }
