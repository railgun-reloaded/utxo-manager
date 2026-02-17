import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

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
} from '../../src/state'
import type { UTXO } from '../../src/state/models'

/**
 *
 * @param overrides
 */
function createMockUTXO (overrides: Partial<UTXO> = {}): UTXO {
  return {
    commitment: `commitment_${Math.random().toString(36).slice(2)}`,
    nullifier: `nullifier_${Math.random().toString(36).slice(2)}`,
    treeNumber: 0n,
    leafIndex: BigInt(Math.floor(Math.random() * 1000)),
    token: '0xtoken_default',
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
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, 'test_nullifier', '0xtxid123')

      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtxid123')
      assert.equal(newState.nullifiers.has('test_nullifier'), true)
    })

    it('records blockNumber when provided', () => {
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, 'test_nullifier', '0xtxid123', 2000n)

      assert.equal(newState.utxos[0]?.spentBlockNumber, 2000n)
    })

    it('does not mark already-spent UTXO again', () => {
      const utxo = createMockUTXO({ nullifier: 'test_nullifier', spent: true, spentTxid: '0xold' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = markSpent(state, 'test_nullifier', '0xnew')

      assert.equal(newState.utxos[0]?.spentTxid, '0xold')
    })
  })

  describe('getUTXO', () => {
    it('retrieves UTXO by commitment', () => {
      const utxo = createMockUTXO({ commitment: 'test_commitment' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const found = getUTXO(state, 'test_commitment')
      assert.deepEqual(found, utxo)
    })

    it('returns undefined for unknown commitment', () => {
      const state = createEmptyState()
      const found = getUTXO(state, 'unknown')
      assert.equal(found, undefined)
    })
  })

  describe('getSpendableUTXOs', () => {
    it('returns only unspent UTXOs', () => {
      const unspent1 = createMockUTXO({ token: '0xtoken1' })
      const spent = createMockUTXO({ token: '0xtoken1', spent: true })
      const unspent2 = createMockUTXO({ token: '0xtoken1' })

      let state = createEmptyState()
      state = addUTXOs(state, [unspent1, spent, unspent2])

      const spendable = getSpendableUTXOs(state)
      assert.equal(spendable.length, 2)
      assert.equal(spendable.every(u => !u.spent), true)
    })

    it('filters by token when provided', () => {
      const token1 = createMockUTXO({ token: '0xtoken1' })
      const token2 = createMockUTXO({ token: '0xtoken2' })

      let state = createEmptyState()
      state = addUTXOs(state, [token1, token2])

      const spendable = getSpendableUTXOs(state, '0xtoken1')
      assert.equal(spendable.length, 1)
      assert.equal(spendable[0]?.token, '0xtoken1')
    })
  })

  describe('isSpent', () => {
    it('returns true for spent nullifier', () => {
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state = markSpent(state, 'test_nullifier', '0xtx')

      assert.equal(isSpent(state, 'test_nullifier'), true)
    })

    it('returns false for unspent nullifier', () => {
      const state = createEmptyState()
      assert.equal(isSpent(state, 'unknown'), false)
    })
  })

  describe('serialization', () => {
    it('serializes and deserializes state correctly', () => {
      const utxo = createMockUTXO({
        commitment: 'test_commitment',
        nullifier: 'test_nullifier',
        spentBlockNumber: 2000n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state = setSyncedBlock(state, 1500n)

      const serialized = serializeState(state)
      const deserialized = deserializeState(serialized)

      assert.equal(deserialized.utxos.length, 1)
      assert.equal(deserialized.utxos[0]?.commitment, 'test_commitment')
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
