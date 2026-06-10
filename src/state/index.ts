import { bytesToHex, hexToBytes } from '@railgun-reloaded/bytes'

import { applyNullifierUpdates } from './nullifiers'
import type { SerializedUTXO, SerializedUTXOState, UTXO, UTXOState } from './types'

/**
 * Creates an empty UTXO state.
 * @returns Empty UTXOState
 * @example
 * const state = createEmptyState()
 */
function createEmptyState (): UTXOState {
  return {
    utxos: [],
    nullifiers: new Set<string>(),
    syncedBlock: 0n
  }
}

/**
 * Adds a single UTXO to the state.
 * @param state - Current UTXO state
 * @param utxo - UTXO to add
 * @returns New state with UTXO added
 * @example
 * const newState = addUTXO(state, utxo)
 */
function addUTXO (state: UTXOState, utxo: UTXO): UTXOState {
  return addUTXOs(state, [utxo])
}

/**
 * Adds multiple UTXOs to the state.
 * @param state - Current UTXO state
 * @param utxos - UTXOs to add
 * @returns New state with UTXOs added
 * @example
 * const newState = addUTXOs(state, [utxo1, utxo2])
 */
function addUTXOs (state: UTXOState, utxos: UTXO[]): UTXOState {
  return {
    ...state,
    utxos: [...state.utxos, ...utxos]
  }
}

/**
 * Marks a UTXO as spent by its nullifier.
 * @param state - Current UTXO state
 * @param nullifier - Nullifier of the UTXO to mark as spent
 * @param txid - Transaction ID where spent
 * @param blockNumber - Optional block number where spent (for reorg handling)
 * @returns New state with UTXO marked as spent
 * @example
 * const nullifier = hexToBytes('abc...')
 * const newState = markSpent(state, nullifier, '0x123...', 1000n)
 */
function markSpent (
  state: UTXOState,
  nullifier: Uint8Array,
  txid: string,
  blockNumber?: bigint
): UTXOState {
  const update = blockNumber === undefined
    ? { nullifier, txid }
    : { nullifier, txid, blockNumber }
  return applyNullifierUpdates(state, [update])
}

/**
 * Applies an array of nullifiers to mark UTXOs as spent.
 * This is a basic version that only takes nullifier byte arrays.
 * @param state - Current UTXO state
 * @param nullifiers - Array of nullifier byte arrays
 * @returns New state with matching UTXOs marked as spent
 * @example
 * const nullifiers = [hexToBytes('abc...'), hexToBytes('def...')]
 * const newState = applyNullifiers(state, nullifiers)
 */
function applyNullifiers (state: UTXOState, nullifiers: Uint8Array[]): UTXOState {
  const updates = nullifiers.map(nullifier => ({ nullifier, txid: 'unknown' }))
  return applyNullifierUpdates(state, updates)
}

/**
 * Sets the synced block number.
 * @param state - Current UTXO state
 * @param blockNumber - Block number to set
 * @returns New state with updated synced block
 * @example
 * const newState = setSyncedBlock(state, 1000n)
 */
function setSyncedBlock (state: UTXOState, blockNumber: bigint): UTXOState {
  return {
    ...state,
    syncedBlock: blockNumber
  }
}

/**
 * Gets a UTXO by its commitment.
 * @param state - Current UTXO state
 * @param commitment - Commitment to search for
 * @returns UTXO if found, undefined otherwise
 * @example
 * const commitment = hexToBytes('abc...')
 * const utxo = getUTXO(state, commitment)
 */
function getUTXO (state: UTXOState, commitment: Uint8Array): UTXO | undefined {
  const commitmentHex = bytesToHex(commitment)
  return state.utxos.find(utxo => bytesToHex(utxo.commitment) === commitmentHex)
}

/**
 * Gets all spendable (unspent) UTXOs, optionally filtered by token.
 * @param state - Current UTXO state
 * @param token - Optional token address (as byte array) to filter by
 * @returns Array of spendable UTXOs
 * @example
 * const token = hexToBytes('token...')
 * const spendable = getSpendableUTXOs(state, token)
 */
function getSpendableUTXOs (state: UTXOState, token?: Uint8Array): UTXO[] {
  let utxos = state.utxos.filter(utxo => !utxo.spent)

  if (token) {
    const tokenHex = bytesToHex(token)
    utxos = utxos.filter(utxo => bytesToHex(utxo.token) === tokenHex)
  }

  return utxos
}

/**
 * Checks if a nullifier has been spent.
 * @param state - Current UTXO state
 * @param nullifier - Nullifier to check
 * @returns True if spent, false otherwise
 * @example
 * const nullifier = hexToBytes('abc...')
 * const spent = isSpent(state, nullifier)
 */
function isSpent (state: UTXOState, nullifier: Uint8Array): boolean {
  return state.nullifiers.has(bytesToHex(nullifier))
}

/**
 * Serializes a single UTXO for storage/transmission.
 * @param utxo - UTXO to serialize
 * @returns Serialized UTXO
 */
function serializeUTXO (utxo: UTXO): SerializedUTXO {
  const serialized: SerializedUTXO = {
    commitment: bytesToHex(utxo.commitment),
    nullifier: bytesToHex(utxo.nullifier),
    treeNumber: utxo.treeNumber.toString(),
    leafIndex: utxo.leafIndex.toString(),
    token: bytesToHex(utxo.token),
    value: utxo.value.toString(),
    blockNumber: utxo.blockNumber.toString(),
    spent: utxo.spent
  }

  if (utxo.spentTxid !== undefined) {
    serialized.spentTxid = utxo.spentTxid
  }

  if (utxo.spentBlockNumber !== undefined) {
    serialized.spentBlockNumber = utxo.spentBlockNumber.toString()
  }

  return serialized
}

/**
 * Deserializes a single UTXO from storage/transmission.
 * @param serialized - Serialized UTXO
 * @returns Deserialized UTXO
 */
function deserializeUTXO (serialized: SerializedUTXO): UTXO {
  const utxo: UTXO = {
    commitment: hexToBytes(serialized.commitment),
    nullifier: hexToBytes(serialized.nullifier),
    treeNumber: BigInt(serialized.treeNumber),
    leafIndex: BigInt(serialized.leafIndex),
    token: hexToBytes(serialized.token),
    value: BigInt(serialized.value),
    blockNumber: BigInt(serialized.blockNumber),
    spent: serialized.spent
  }

  if (serialized.spentTxid !== undefined) {
    utxo.spentTxid = serialized.spentTxid
  }

  if (serialized.spentBlockNumber !== undefined) {
    utxo.spentBlockNumber = BigInt(serialized.spentBlockNumber)
  }

  return utxo
}

/**
 * Serializes the entire UTXO state for storage/transmission.
 * @param state - UTXO state to serialize
 * @returns Serialized state
 * @example
 * const serialized = serializeState(state)
 * localStorage.setItem('utxoState', JSON.stringify(serialized))
 */
function serializeState (state: UTXOState): SerializedUTXOState {
  return {
    utxos: state.utxos.map(serializeUTXO),
    nullifiers: Array.from(state.nullifiers),
    syncedBlock: state.syncedBlock.toString()
  }
}

/**
 * Deserializes UTXO state from storage/transmission.
 * @param serialized - Serialized state
 * @returns Deserialized state
 * @example
 * const json = localStorage.getItem('utxoState')
 * const state = deserializeState(JSON.parse(json))
 */
function deserializeState (serialized: SerializedUTXOState): UTXOState {
  return {
    utxos: serialized.utxos.map(deserializeUTXO),
    nullifiers: new Set(serialized.nullifiers),
    syncedBlock: BigInt(serialized.syncedBlock)
  }
}

export {
  addUTXO,
  addUTXOs,
  applyNullifiers,
  createEmptyState,
  deserializeState,
  deserializeUTXO,
  getSpendableUTXOs,
  getUTXO,
  isSpent,
  markSpent,
  serializeState,
  serializeUTXO,
  setSyncedBlock
}
export type * from './types'
