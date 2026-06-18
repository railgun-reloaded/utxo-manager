import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bytesToHex, hexToBytes } from '@railgun-reloaded/bytes'

import {
  addUTXO,
  addUTXOs,
  createEmptyState,
  deserializeState,
  getSpendableUTXOs,
  getUTXO,
  isSpent,
  markSpent,
  serializeState,
  setSyncedBlock
} from '../../src/state/index.js'
import type { UTXO } from '../../src/state/types.js'

/**
 * Creates a mock UTXO for testing purposes.
 * @param overrides - Optional properties to override in the mock UTXO
 * @returns A mock UTXO with random or provided values
 */
function createMockUTXO (overrides: Partial<UTXO> = {}): UTXO {
  /**
   * Generates a random 32-byte array for testing.
   * @returns Random Uint8Array of 32 bytes
   */
  const randomHex = () => {
    const bytes = new Uint8Array(32)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
    return bytes
  }

  return {
    commitment: randomHex(),
    nullifier: randomHex(),
    treeNumber: 0n,
    leafIndex: BigInt(Math.floor(Math.random() * 1000)),
    token: hexToBytes('0000000000000000000000000000000000000001'), // default token
    value: BigInt(Math.floor(Math.random() * 10000) + 100),
    blockNumber: 1000n,
    spent: false,
    ...overrides
  }
}

describe('UTXO State Management', () => {
  describe('createEmptyState', () => {
    it('creates empty state with no UTXOs', () => {
      const state = createEmptyState()
      assert.equal(state.utxos.length, 0)
      assert.equal(state.nullifiers.size, 0)
      assert.equal(state.syncedBlock, 0n)
    })
  })

  describe('addUTXO', () => {
    it('adds a UTXO to state', () => {
      const state = createEmptyState()
      const utxo = createMockUTXO()
      const newState = addUTXO(state, utxo)

      assert.equal(newState.utxos.length, 1)
      assert.deepEqual(newState.utxos[0], utxo)
    })

    it('does not mutate original state', () => {
      const state = createEmptyState()
      const utxo = createMockUTXO()
      addUTXO(state, utxo)

      assert.equal(state.utxos.length, 0)
    })
  })

  describe('addUTXOs', () => {
    it('adds multiple UTXOs to state', () => {
      const state = createEmptyState()
      const utxos = [createMockUTXO(), createMockUTXO(), createMockUTXO()]
      const newState = addUTXOs(state, utxos)

      assert.equal(newState.utxos.length, 3)
    })
  })

  describe('markSpent', () => {
    it('marks a UTXO as spent', () => {
      const testNullifier = hexToBytes('0123456789abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, testNullifier, '0xtxid123')

      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtxid123')
      assert.equal(newState.nullifiers.has(bytesToHex(testNullifier)), true)
    })

    it('records blockNumber when provided', () => {
      const testNullifier = hexToBytes('0123456789abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, testNullifier, '0xtxid123', 2000n)

      assert.equal(newState.utxos[0]?.spentBlockNumber, 2000n)
    })

    it('does not mark already-spent UTXO again', () => {
      const testNullifier = hexToBytes('0123456789abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier, spent: true, spentTxid: '0xold' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, testNullifier, '0xnew')

      assert.equal(newState.utxos[0]?.spentTxid, '0xold')
    })
  })

  describe('getUTXO', () => {
    it('retrieves UTXO by commitment', () => {
      const testCommitment = hexToBytes('fedcba9876543210')
      const utxo = createMockUTXO({ commitment: testCommitment })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const found = getUTXO(state, testCommitment)
      assert.deepEqual(found, utxo)
    })

    it('returns undefined for unknown commitment', () => {
      const state = createEmptyState()
      const found = getUTXO(state, hexToBytes('deadbeef00'))
      assert.equal(found, undefined)
    })
  })

  describe('getSpendableUTXOs', () => {
    it('returns only unspent UTXOs', () => {
      const token1 = hexToBytes('0000000000000000000000000000000000000001')
      const unspent1 = createMockUTXO({ token: token1 })
      const spent = createMockUTXO({ token: token1, spent: true })
      const unspent2 = createMockUTXO({ token: token1 })

      let state = createEmptyState()
      state = addUTXOs(state, [unspent1, spent, unspent2])

      const spendable = getSpendableUTXOs(state)
      assert.equal(spendable.length, 2)
      assert.equal(spendable.every(u => !u.spent), true)
    })

    it('filters by token when provided', () => {
      const token1Bytes = hexToBytes('0000000000000000000000000000000000000001')
      const token2Bytes = hexToBytes('0000000000000000000000000000000000000002')
      const token1 = createMockUTXO({ token: token1Bytes })
      const token2 = createMockUTXO({ token: token2Bytes })

      let state = createEmptyState()
      state = addUTXOs(state, [token1, token2])

      const spendable = getSpendableUTXOs(state, token1Bytes)
      assert.equal(spendable.length, 1)
      assert.equal(bytesToHex(spendable[0]?.token || new Uint8Array()), bytesToHex(token1Bytes))
    })
  })

  describe('isSpent', () => {
    it('returns true for spent nullifier', () => {
      const testNullifier = hexToBytes('0123456789abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state = markSpent(state, testNullifier, '0xtx')

      assert.equal(isSpent(state, testNullifier), true)
    })

    it('returns false for unspent nullifier', () => {
      const state = createEmptyState()
      assert.equal(isSpent(state, hexToBytes('deadbeef00')), false)
    })
  })

  describe('serialization', () => {
    it('serializes and deserializes state correctly', () => {
      const testCommitment = hexToBytes('fedcba9876543210')
      const testNullifier = hexToBytes('0123456789abcdef')
      const utxo = createMockUTXO({
        commitment: testCommitment,
        nullifier: testNullifier,
        spentBlockNumber: 2000n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state = setSyncedBlock(state, 1500n)

      const serialized = serializeState(state)
      const deserialized = deserializeState(serialized)

      assert.equal(deserialized.utxos.length, 1)
      assert.equal(bytesToHex(deserialized.utxos[0]?.commitment || new Uint8Array()), bytesToHex(testCommitment))
      assert.equal(deserialized.utxos[0]?.spentBlockNumber, 2000n)
      assert.equal(deserialized.syncedBlock, 1500n)
    })

    it('handles undefined spentBlockNumber', () => {
      const utxo = createMockUTXO()
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const serialized = serializeState(state)
      const deserialized = deserializeState(serialized)

      assert.equal(deserialized.utxos[0]?.spentBlockNumber, undefined)
    })
  })

  describe('setSyncedBlock', () => {
    it('updates synced block number', () => {
      const state = createEmptyState()
      const newState = setSyncedBlock(state, 5000n)

      assert.equal(newState.syncedBlock, 5000n)
    })
  })
})
