import type { UTXO, UTXOState } from './models'
import { toHex } from './utils'

export interface NullifierUpdate {
  nullifier: Uint8Array
  txid: string
  blockNumber?: bigint
}

/**
 * Applies nullifier updates to mark UTXOs as spent in the state.
 * @param state - Current UTXO state to update
 * @param updates - Iterable of nullifier updates containing spend information
 * @returns Updated state with UTXOs marked as spent
 */
export function applyNullifierUpdates (
  state: UTXOState,
  updates: Iterable<NullifierUpdate>
): UTXOState {
  const newNullifiers = new Set(state.nullifiers)
  const updateMap = new Map<string, NullifierUpdate>()

  for (const update of updates) {
    const nullifierHex = toHex(update.nullifier)
    newNullifiers.add(nullifierHex)
    updateMap.set(nullifierHex, update)
  }

  if (updateMap.size === 0) {
    return state
  }

  const newUtxos = state.utxos.map(utxo => {
    const nullifierHex = toHex(utxo.nullifier)
    const update = updateMap.get(nullifierHex)
    if (update && !utxo.spent) {
      const updated: UTXO = {
        ...utxo,
        spent: true,
        spentTxid: update.txid
      }
      if (update.blockNumber !== undefined) {
        updated.spentBlockNumber = update.blockNumber
      }
      return updated
    }
    return utxo
  })

  return {
    ...state,
    utxos: newUtxos,
    nullifiers: newNullifiers
  }
}
