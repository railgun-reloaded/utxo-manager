import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { UTXO } from '../../src/state/models'
import type { NullifierEvent } from '../../src/state/events'
import { createEmptyState, addUTXO, addUTXOs } from '../../src/state'
import { applyNullifierEvents, handleReorg } from '../../src/state/events'

function createMockUTXO(overrides: Partial<UTXO> = {}): UTXO {
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

describe('Nullifier Events', () => {
  describe('applyNullifierEvents', () => {
    it('marks UTXO as spent when nullifier matches', () => {
      const utxo = createMockUTXO({ nullifier: 'test_nullifier_123' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: 'test_nullifier_123',
          txid: '0xtxid_abc',
          blockNumber: 1500n
        }
      ]

      const newState = applyNullifierEvents(state, events)

      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtxid_abc')
      assert.equal(newState.utxos[0]?.spentBlockNumber, 1500n)
    })

    it('records txid and blockNumber on spent UTXO', () => {
      const utxo = createMockUTXO({ nullifier: 'nullifier_xyz' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: 'nullifier_xyz',
          txid: '0xtransaction_hash_123',
          blockNumber: 2000n
        }
      ]

      const newState = applyNullifierEvents(state, events)
      const spentUtxo = newState.utxos[0]

      assert.equal(spentUtxo?.spentTxid, '0xtransaction_hash_123')
      assert.equal(spentUtxo?.spentBlockNumber, 2000n)
    })

    it('adds nullifier to state.nullifiers set', () => {
      const utxo = createMockUTXO({ nullifier: 'nullifier_test' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: 'nullifier_test',
          txid: '0xtxid',
          blockNumber: 1200n
        }
      ]

      const newState = applyNullifierEvents(state, events)

      assert.equal(newState.nullifiers.has('nullifier_test'), true)
    })

    it('handles multiple events in one call', () => {
      const utxo1 = createMockUTXO({ nullifier: 'nullifier_1' })
      const utxo2 = createMockUTXO({ nullifier: 'nullifier_2' })
      const utxo3 = createMockUTXO({ nullifier: 'nullifier_3' })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2, utxo3])

      const events: NullifierEvent[] = [
        { nullifier: 'nullifier_1', txid: '0xtx1', blockNumber: 1500n },
        { nullifier: 'nullifier_2', txid: '0xtx2', blockNumber: 1501n }
      ]

      const newState = applyNullifierEvents(state, events)

      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[1]?.spent, true)
      assert.equal(newState.utxos[2]?.spent, false)
      assert.equal(newState.nullifiers.size, 2)
    })

    it('ignores events for unknown nullifiers (no matching UTXO)', () => {
      const utxo = createMockUTXO({ nullifier: 'known_nullifier' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: 'unknown_nullifier', txid: '0xtx', blockNumber: 1500n }
      ]

      const newState = applyNullifierEvents(state, events)

      // UTXO should remain unspent
      assert.equal(newState.utxos[0]?.spent, false)
      // But nullifier should still be added to the set
      assert.equal(newState.nullifiers.has('unknown_nullifier'), true)
    })

    it('is idempotent - applying same event twice has no additional effect', () => {
      const utxo = createMockUTXO({ nullifier: 'nullifier_idempotent' })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: 'nullifier_idempotent', txid: '0xtx1', blockNumber: 1500n }
      ]

      // Apply once
      let newState = applyNullifierEvents(state, events)
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')

      // Apply again with different event data
      const events2: NullifierEvent[] = [
        { nullifier: 'nullifier_idempotent', txid: '0xtx2', blockNumber: 1600n }
      ]
      newState = applyNullifierEvents(newState, events2)

      // Should keep original spent data
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')
      assert.equal(newState.utxos[0]?.spentBlockNumber, 1500n)
    })

    it('does not affect already-spent UTXOs', () => {
      const utxo = createMockUTXO({
        nullifier: 'already_spent',
        spent: true,
        spentTxid: '0xoriginal_tx',
        spentBlockNumber: 1000n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: 'already_spent', txid: '0xnew_tx', blockNumber: 1500n }
      ]

      const newState = applyNullifierEvents(state, events)

      // Should retain original spent data
      assert.equal(newState.utxos[0]?.spentTxid, '0xoriginal_tx')
      assert.equal(newState.utxos[0]?.spentBlockNumber, 1000n)
    })
  })

  describe('handleReorg', () => {
    it('reverts UTXOs spent after reorg block', () => {
      const utxo = createMockUTXO({
        nullifier: 'nullifier_reorg',
        spent: true,
        spentTxid: '0xtx',
        spentBlockNumber: 1500n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state.nullifiers.add('nullifier_reorg')

      // Reorg at block 1400 - UTXO was spent at 1500, so should be reverted
      const newState = handleReorg(state, 1400n)

      assert.equal(newState.utxos[0]?.spent, false)
      assert.equal(newState.utxos[0]?.spentTxid, undefined)
      assert.equal(newState.utxos[0]?.spentBlockNumber, undefined)
      assert.equal(newState.nullifiers.has('nullifier_reorg'), false)
    })

    it('keeps UTXOs spent at or before reorg block', () => {
      const utxo1 = createMockUTXO({
        nullifier: 'nullifier_at_block',
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 1500n
      })
      const utxo2 = createMockUTXO({
        nullifier: 'nullifier_before_block',
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 1400n
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2])
      state.nullifiers.add('nullifier_at_block')
      state.nullifiers.add('nullifier_before_block')

      // Reorg at block 1500 - only UTXOs spent AFTER 1500 should be reverted
      const newState = handleReorg(state, 1500n)

      // UTXO spent AT block 1500 should be kept
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')
      assert.equal(newState.nullifiers.has('nullifier_at_block'), true)

      // UTXO spent BEFORE block 1500 should be kept
      assert.equal(newState.utxos[1]?.spent, true)
      assert.equal(newState.utxos[1]?.spentTxid, '0xtx2')
      assert.equal(newState.nullifiers.has('nullifier_before_block'), true)
    })

    it('removes nullifiers from set when reverting', () => {
      const utxo = createMockUTXO({
        nullifier: 'nullifier_to_remove',
        spent: true,
        spentTxid: '0xtx',
        spentBlockNumber: 1500n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state.nullifiers.add('nullifier_to_remove')

      const newState = handleReorg(state, 1400n)

      assert.equal(newState.nullifiers.has('nullifier_to_remove'), false)
    })

    it('clears spentTxid and spentBlockNumber on reverted UTXOs', () => {
      const utxo = createMockUTXO({
        nullifier: 'nullifier_clear',
        spent: true,
        spentTxid: '0xtx_to_clear',
        spentBlockNumber: 2000n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const newState = handleReorg(state, 1500n)

      assert.equal(newState.utxos[0]?.spentTxid, undefined)
      assert.equal(newState.utxos[0]?.spentBlockNumber, undefined)
    })

    it('handles empty state', () => {
      const state = createEmptyState()
      const newState = handleReorg(state, 1000n)

      assert.equal(newState.utxos.length, 0)
      assert.equal(newState.nullifiers.size, 0)
    })

    it('handles state with no spent UTXOs', () => {
      const utxo1 = createMockUTXO({ spent: false })
      const utxo2 = createMockUTXO({ spent: false })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2])

      const newState = handleReorg(state, 1000n)

      assert.equal(newState.utxos[0]?.spent, false)
      assert.equal(newState.utxos[1]?.spent, false)
    })

    it('handles reorg at block 0 (reverts everything)', () => {
      const utxo1 = createMockUTXO({
        nullifier: 'nullifier_1',
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 100n
      })
      const utxo2 = createMockUTXO({
        nullifier: 'nullifier_2',
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 500n
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2])
      state.nullifiers.add('nullifier_1')
      state.nullifiers.add('nullifier_2')

      const newState = handleReorg(state, 0n)

      // All UTXOs should be reverted
      assert.equal(newState.utxos[0]?.spent, false)
      assert.equal(newState.utxos[1]?.spent, false)
      assert.equal(newState.nullifiers.size, 0)
    })

    it('handles mixed scenario with multiple UTXOs', () => {
      const utxo1 = createMockUTXO({
        nullifier: 'n1',
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 900n
      })
      const utxo2 = createMockUTXO({
        nullifier: 'n2',
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 1000n
      })
      const utxo3 = createMockUTXO({
        nullifier: 'n3',
        spent: true,
        spentTxid: '0xtx3',
        spentBlockNumber: 1100n
      })
      const utxo4 = createMockUTXO({
        nullifier: 'n4',
        spent: false
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2, utxo3, utxo4])
      state.nullifiers.add('n1')
      state.nullifiers.add('n2')
      state.nullifiers.add('n3')

      // Reorg at block 1000
      const newState = handleReorg(state, 1000n)

      // Before and at reorg point - kept
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[1]?.spent, true)

      // After reorg point - reverted
      assert.equal(newState.utxos[2]?.spent, false)
      assert.equal(newState.utxos[2]?.spentTxid, undefined)

      // Was never spent - unchanged
      assert.equal(newState.utxos[3]?.spent, false)

      // Nullifiers check
      assert.equal(newState.nullifiers.has('n1'), true)
      assert.equal(newState.nullifiers.has('n2'), true)
      assert.equal(newState.nullifiers.has('n3'), false)
    })
  })
})
