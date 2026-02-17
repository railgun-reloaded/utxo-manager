import type { UTXO, UTXOState } from './models'

export interface NullifierUpdate {
  nullifier: string
  txid: string
  blockNumber?: bigint
}

export function applyNullifierUpdates(
  state: UTXOState,
  updates: Iterable<NullifierUpdate>
): UTXOState {
  const newNullifiers = new Set(state.nullifiers)
  const updateMap = new Map<string, NullifierUpdate>()

  for (const update of updates) {
    newNullifiers.add(update.nullifier)
    updateMap.set(update.nullifier, update)
  }

  if (updateMap.size === 0) {
    return state
  }

  const newUtxos = state.utxos.map(utxo => {
    const update = updateMap.get(utxo.nullifier)
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
