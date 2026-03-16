import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { UTXO } from '../../src/state/models'
import type { NullifierEvent } from '../../src/state/events'
import { createEmptyState, addUTXO, addUTXOs, fromHex, toHex } from '../../src/state'
import { applyNullifierEvents, handleReorg } from '../../src/state/events'

function createMockUTXO(overrides: Partial<UTXO> = {}): UTXO {
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
    token: fromHex('0000000000000000000000000000000000000001'),
    value: BigInt(Math.floor(Math.random() * 10000) + 100),
    blockNumber: 1000n,
    spent: false,
    ...overrides
  }
}

describe('Nullifier Events', () => {
  describe('applyNullifierEvents', () => {
    it('marks UTXO as spent when nullifier matches', () => {
      const testNullifier = fromHex('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: testNullifier,
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
      const testNullifier = fromHex('fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: testNullifier,
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
      const testNullifier = fromHex('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        {
          nullifier: testNullifier,
          txid: '0xtxid',
          blockNumber: 1200n
        }
      ]

      const newState = applyNullifierEvents(state, events)

      assert.equal(newState.nullifiers.has(toHex(testNullifier)), true)
    })

    it('handles multiple events in one call', () => {
      const nullifier1 = fromHex('1111111111111111111111111111111111111111111111111111111111111111')
      const nullifier2 = fromHex('2222222222222222222222222222222222222222222222222222222222222222')
      const nullifier3 = fromHex('3333333333333333333333333333333333333333333333333333333333333333')
      const utxo1 = createMockUTXO({ nullifier: nullifier1 })
      const utxo2 = createMockUTXO({ nullifier: nullifier2 })
      const utxo3 = createMockUTXO({ nullifier: nullifier3 })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2, utxo3])

      const events: NullifierEvent[] = [
        { nullifier: nullifier1, txid: '0xtx1', blockNumber: 1500n },
        { nullifier: nullifier2, txid: '0xtx2', blockNumber: 1501n }
      ]

      const newState = applyNullifierEvents(state, events)

      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[1]?.spent, true)
      assert.equal(newState.utxos[2]?.spent, false)
      assert.equal(newState.nullifiers.size, 2)
    })

    it('ignores events for unknown nullifiers (no matching UTXO)', () => {
      const knownNullifier = fromHex('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      const unknownNullifier = fromHex('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
      const utxo = createMockUTXO({ nullifier: knownNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: unknownNullifier, txid: '0xtx', blockNumber: 1500n }
      ]

      const newState = applyNullifierEvents(state, events)

      // UTXO should remain unspent
      assert.equal(newState.utxos[0]?.spent, false)
      // But nullifier should still be added to the set
      assert.equal(newState.nullifiers.has(toHex(unknownNullifier)), true)
    })

    it('is idempotent - applying same event twice has no additional effect', () => {
      const testNullifier = fromHex('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: testNullifier, txid: '0xtx1', blockNumber: 1500n }
      ]

      // Apply once
      let newState = applyNullifierEvents(state, events)
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')

      // Apply again with different event data
      const events2: NullifierEvent[] = [
        { nullifier: testNullifier, txid: '0xtx2', blockNumber: 1600n }
      ]
      newState = applyNullifierEvents(newState, events2)

      // Should keep original spent data
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')
      assert.equal(newState.utxos[0]?.spentBlockNumber, 1500n)
    })

    it('does not affect already-spent UTXOs', () => {
      const testNullifier = fromHex('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')
      const utxo = createMockUTXO({
        nullifier: testNullifier,
        spent: true,
        spentTxid: '0xoriginal_tx',
        spentBlockNumber: 1000n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)

      const events: NullifierEvent[] = [
        { nullifier: testNullifier, txid: '0xnew_tx', blockNumber: 1500n }
      ]

      const newState = applyNullifierEvents(state, events)

      // Should retain original spent data
      assert.equal(newState.utxos[0]?.spentTxid, '0xoriginal_tx')
      assert.equal(newState.utxos[0]?.spentBlockNumber, 1000n)
    })
  })

  describe('handleReorg', () => {
    it('reverts UTXOs spent after reorg block', () => {
      const testNullifier = fromHex('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
      const utxo = createMockUTXO({
        nullifier: testNullifier,
        spent: true,
        spentTxid: '0xtx',
        spentBlockNumber: 1500n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state.nullifiers.add(toHex(testNullifier))

      // Reorg at block 1400 - UTXO was spent at 1500, so should be reverted
      const newState = handleReorg(state, 1400n)

      assert.equal(newState.utxos[0]?.spent, false)
      assert.equal(newState.utxos[0]?.spentTxid, undefined)
      assert.equal(newState.utxos[0]?.spentBlockNumber, undefined)
      assert.equal(newState.nullifiers.has(toHex(testNullifier)), false)
    })

    it('keeps UTXOs spent at or before reorg block', () => {
      const nullifier1 = fromHex('f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1')
      const nullifier2 = fromHex('f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2')
      const utxo1 = createMockUTXO({
        nullifier: nullifier1,
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 1500n
      })
      const utxo2 = createMockUTXO({
        nullifier: nullifier2,
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 1400n
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2])
      state.nullifiers.add(toHex(nullifier1))
      state.nullifiers.add(toHex(nullifier2))

      // Reorg at block 1500 - only UTXOs spent AFTER 1500 should be reverted
      const newState = handleReorg(state, 1500n)

      // UTXO spent AT block 1500 should be kept
      assert.equal(newState.utxos[0]?.spent, true)
      assert.equal(newState.utxos[0]?.spentTxid, '0xtx1')
      assert.equal(newState.nullifiers.has(toHex(nullifier1)), true)

      // UTXO spent BEFORE block 1500 should be kept
      assert.equal(newState.utxos[1]?.spent, true)
      assert.equal(newState.utxos[1]?.spentTxid, '0xtx2')
      assert.equal(newState.nullifiers.has(toHex(nullifier2)), true)
    })

    it('removes nullifiers from set when reverting', () => {
      const testNullifier = fromHex('f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3')
      const utxo = createMockUTXO({
        nullifier: testNullifier,
        spent: true,
        spentTxid: '0xtx',
        spentBlockNumber: 1500n
      })
      let state = createEmptyState()
      state = addUTXO(state, utxo)
      state.nullifiers.add(toHex(testNullifier))

      const newState = handleReorg(state, 1400n)

      assert.equal(newState.nullifiers.has(toHex(testNullifier)), false)
    })

    it('clears spentTxid and spentBlockNumber on reverted UTXOs', () => {
      const testNullifier = fromHex('f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4f4')
      const utxo = createMockUTXO({
        nullifier: testNullifier,
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
      const nullifier1 = fromHex('f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5')
      const nullifier2 = fromHex('f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6')
      const utxo1 = createMockUTXO({
        nullifier: nullifier1,
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 100n
      })
      const utxo2 = createMockUTXO({
        nullifier: nullifier2,
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 500n
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2])
      state.nullifiers.add(toHex(nullifier1))
      state.nullifiers.add(toHex(nullifier2))

      const newState = handleReorg(state, 0n)

      // All UTXOs should be reverted
      assert.equal(newState.utxos[0]?.spent, false)
      assert.equal(newState.utxos[1]?.spent, false)
      assert.equal(newState.nullifiers.size, 0)
    })

    it('handles mixed scenario with multiple UTXOs', () => {
      const n1 = fromHex('f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7')
      const n2 = fromHex('f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8')
      const n3 = fromHex('f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9')
      const n4 = fromHex('fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa')
      const utxo1 = createMockUTXO({
        nullifier: n1,
        spent: true,
        spentTxid: '0xtx1',
        spentBlockNumber: 900n
      })
      const utxo2 = createMockUTXO({
        nullifier: n2,
        spent: true,
        spentTxid: '0xtx2',
        spentBlockNumber: 1000n
      })
      const utxo3 = createMockUTXO({
        nullifier: n3,
        spent: true,
        spentTxid: '0xtx3',
        spentBlockNumber: 1100n
      })
      const utxo4 = createMockUTXO({
        nullifier: n4,
        spent: false
      })

      let state = createEmptyState()
      state = addUTXOs(state, [utxo1, utxo2, utxo3, utxo4])
      state.nullifiers.add(toHex(n1))
      state.nullifiers.add(toHex(n2))
      state.nullifiers.add(toHex(n3))

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
      assert.equal(newState.nullifiers.has(toHex(n1)), true)
      assert.equal(newState.nullifiers.has(toHex(n2)), true)
      assert.equal(newState.nullifiers.has(toHex(n3)), false)
    })
  })
})
