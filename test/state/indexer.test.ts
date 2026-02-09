import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { UTXO, NullifierEvent } from '../../src'
import { NullifierIndexer } from '../../src'

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

describe('NullifierIndexer', () => {
  describe('initialization', () => {
    it('creates empty indexer', () => {
      const indexer = new NullifierIndexer()

      assert.equal(indexer.getUTXOCount(), 0)
      assert.equal(indexer.getNullifierCount(), 0)
      assert.equal(indexer.getSyncedBlock(), 0n)
    })

    it('restores from initial state', () => {
      const utxo = createMockUTXO()
      const indexer1 = new NullifierIndexer()
      indexer1.addUTXO(utxo)
      indexer1.setSyncedBlock(1000n)

      const state = indexer1.getState()
      const indexer2 = new NullifierIndexer(state)

      assert.equal(indexer2.getUTXOCount(), 1)
      assert.equal(indexer2.getSyncedBlock(), 1000n)
    })
  })

  describe('addUTXO / addUTXOs', () => {
    it('adds single UTXO', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ commitment: 'test_commitment' })

      indexer.addUTXO(utxo)

      assert.equal(indexer.getUTXOCount(), 1)
      const retrieved = indexer.getUTXO('test_commitment')
      assert.deepEqual(retrieved, utxo)
    })

    it('adds multiple UTXOs in batch', () => {
      const indexer = new NullifierIndexer()
      const utxos = [
        createMockUTXO(),
        createMockUTXO(),
        createMockUTXO()
      ]

      indexer.addUTXOs(utxos)

      assert.equal(indexer.getUTXOCount(), 3)
    })
  })

  describe('processNullifierEvents', () => {
    it('marks UTXOs as spent when scanner provides events', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      indexer.addUTXO(utxo)

      // Scanner detects nullifier event
      const events: NullifierEvent[] = [
        {
          nullifier: 'test_nullifier',
          txid: '0xtxid_123',
          blockNumber: 1500n
        }
      ]

      // Scanner feeds events downstream to indexer
      indexer.processNullifierEvents(events)

      // Verify UTXO is now marked spent
      assert.equal(indexer.isSpent('test_nullifier'), true)
      assert.equal(indexer.getNullifierCount(), 1)

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 0)
    })

    it('handles batch of events from scanner', () => {
      const indexer = new NullifierIndexer()
      const utxo1 = createMockUTXO({ nullifier: 'nullifier_1' })
      const utxo2 = createMockUTXO({ nullifier: 'nullifier_2' })
      const utxo3 = createMockUTXO({ nullifier: 'nullifier_3' })
      indexer.addUTXOs([utxo1, utxo2, utxo3])

      // Scanner provides batch of events
      const events: NullifierEvent[] = [
        { nullifier: 'nullifier_1', txid: '0xtx1', blockNumber: 1500n },
        { nullifier: 'nullifier_2', txid: '0xtx2', blockNumber: 1501n }
      ]

      indexer.processNullifierEvents(events)

      assert.equal(indexer.getNullifierCount(), 2)
      assert.equal(indexer.isSpent('nullifier_1'), true)
      assert.equal(indexer.isSpent('nullifier_2'), true)
      assert.equal(indexer.isSpent('nullifier_3'), false)
    })

    it('handles events for unknown nullifiers gracefully', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ nullifier: 'known' })
      indexer.addUTXO(utxo)

      // Scanner sees nullifier for UTXO we don't own
      const events: NullifierEvent[] = [
        { nullifier: 'unknown_nullifier', txid: '0xtx', blockNumber: 1500n }
      ]

      indexer.processNullifierEvents(events)

      // Should not crash, nullifier is tracked but no UTXO matches
      assert.equal(indexer.getNullifierCount(), 1)
      assert.equal(indexer.isSpent('unknown_nullifier'), true)
    })
  })

  describe('handleReorg', () => {
    it('reverts spent UTXOs after reorg', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      indexer.addUTXO(utxo)

      // UTXO spent at block 1500
      const events: NullifierEvent[] = [
        { nullifier: 'test_nullifier', txid: '0xtx', blockNumber: 1500n }
      ]
      indexer.processNullifierEvents(events)

      assert.equal(indexer.isSpent('test_nullifier'), true)

      // Chain reorgs to block 1400
      indexer.handleReorg(1400n)

      // UTXO should be unspent again
      assert.equal(indexer.isSpent('test_nullifier'), false)
      assert.equal(indexer.getNullifierCount(), 0)

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 1)
    })

    it('keeps UTXOs spent before reorg point', () => {
      const indexer = new NullifierIndexer()
      const utxo1 = createMockUTXO({ nullifier: 'nullifier_early' })
      const utxo2 = createMockUTXO({ nullifier: 'nullifier_late' })
      indexer.addUTXOs([utxo1, utxo2])

      // Spend at different blocks
      indexer.processNullifierEvents([
        { nullifier: 'nullifier_early', txid: '0xtx1', blockNumber: 1000n },
        { nullifier: 'nullifier_late', txid: '0xtx2', blockNumber: 1500n }
      ])

      // Reorg to block 1200
      indexer.handleReorg(1200n)

      // Early spend is kept, late spend is reverted
      assert.equal(indexer.isSpent('nullifier_early'), true)
      assert.equal(indexer.isSpent('nullifier_late'), false)
      assert.equal(indexer.getNullifierCount(), 1)
    })
  })

  describe('query methods', () => {
    it('getSpendableUTXOs returns only unspent', () => {
      const indexer = new NullifierIndexer()
      const unspent = createMockUTXO({ token: '0xtoken1' })
      const spent = createMockUTXO({ token: '0xtoken1', nullifier: 'spent_nullifier' })
      indexer.addUTXOs([unspent, spent])

      indexer.processNullifierEvents([
        { nullifier: 'spent_nullifier', txid: '0xtx', blockNumber: 1500n }
      ])

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 1)
      assert.equal(spendable[0]?.spent, false)
    })

    it('getSpendableUTXOs filters by token', () => {
      const indexer = new NullifierIndexer()
      const token1 = createMockUTXO({ token: '0xtoken1' })
      const token2 = createMockUTXO({ token: '0xtoken2' })
      indexer.addUTXOs([token1, token2])

      const spendable = indexer.getSpendableUTXOs('0xtoken1')
      assert.equal(spendable.length, 1)
      assert.equal(spendable[0]?.token, '0xtoken1')
    })

    it('getAllUTXOs returns all UTXOs', () => {
      const indexer = new NullifierIndexer()
      const utxo1 = createMockUTXO()
      const utxo2 = createMockUTXO({ nullifier: 'spent_nullifier' })
      indexer.addUTXOs([utxo1, utxo2])

      indexer.processNullifierEvents([
        { nullifier: 'spent_nullifier', txid: '0xtx', blockNumber: 1500n }
      ])

      const all = indexer.getAllUTXOs()
      assert.equal(all.length, 2)
    })

    it('isSpent checks nullifier index', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ nullifier: 'test_nullifier' })
      indexer.addUTXO(utxo)

      assert.equal(indexer.isSpent('test_nullifier'), false)

      indexer.processNullifierEvents([
        { nullifier: 'test_nullifier', txid: '0xtx', blockNumber: 1500n }
      ])

      assert.equal(indexer.isSpent('test_nullifier'), true)
    })

    it('getUTXO retrieves by commitment', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO({ commitment: 'test_commitment' })
      indexer.addUTXO(utxo)

      const retrieved = indexer.getUTXO('test_commitment')
      assert.deepEqual(retrieved, utxo)

      const notFound = indexer.getUTXO('unknown')
      assert.equal(notFound, undefined)
    })
  })

  describe('state management', () => {
    it('tracks synced block', () => {
      const indexer = new NullifierIndexer()

      indexer.setSyncedBlock(1000n)
      assert.equal(indexer.getSyncedBlock(), 1000n)

      indexer.setSyncedBlock(2000n)
      assert.equal(indexer.getSyncedBlock(), 2000n)
    })

    it('provides immutable state snapshot', () => {
      const indexer = new NullifierIndexer()
      const utxo = createMockUTXO()
      indexer.addUTXO(utxo)

      const snapshot = indexer.getState()

      // Modifying snapshot doesn't affect indexer
      snapshot.utxos.push(createMockUTXO())
      snapshot.nullifiers.add('fake')

      assert.equal(indexer.getUTXOCount(), 1)
      assert.equal(indexer.getNullifierCount(), 0)
    })

    it('clears all state', () => {
      const indexer = new NullifierIndexer()
      indexer.addUTXO(createMockUTXO())
      indexer.setSyncedBlock(1000n)

      indexer.clear()

      assert.equal(indexer.getUTXOCount(), 0)
      assert.equal(indexer.getSyncedBlock(), 0n)
    })
  })

  describe('serialization', () => {
    it('serializes and deserializes state', () => {
      const indexer1 = new NullifierIndexer()
      const utxo = createMockUTXO({ commitment: 'test_commitment' })
      indexer1.addUTXO(utxo)
      indexer1.processNullifierEvents([
        { nullifier: utxo.nullifier, txid: '0xtx', blockNumber: 1500n }
      ])
      indexer1.setSyncedBlock(1500n)

      // Serialize
      const serialized = indexer1.serialize()

      // Deserialize into new instance
      const indexer2 = NullifierIndexer.deserialize(serialized)

      assert.equal(indexer2.getUTXOCount(), 1)
      assert.equal(indexer2.getNullifierCount(), 1)
      assert.equal(indexer2.getSyncedBlock(), 1500n)
      assert.equal(indexer2.isSpent(utxo.nullifier), true)
    })

    it('round-trip serialization preserves state', () => {
      const indexer1 = new NullifierIndexer()

      // Add multiple UTXOs with various states
      const utxos = [
        createMockUTXO({ token: '0xtoken1', nullifier: 'n1' }),
        createMockUTXO({ token: '0xtoken2', nullifier: 'n2' }),
        createMockUTXO({ token: '0xtoken1', nullifier: 'n3' })
      ]
      indexer1.addUTXOs(utxos)

      // Spend some
      indexer1.processNullifierEvents([
        { nullifier: 'n1', txid: '0xtx1', blockNumber: 1500n }
      ])

      indexer1.setSyncedBlock(1500n)

      // Serialize and deserialize
      const serialized = JSON.stringify(indexer1.serialize())
      const indexer2 = NullifierIndexer.deserialize(JSON.parse(serialized))

      // Verify all state is preserved
      assert.equal(indexer2.getUTXOCount(), 3)
      assert.equal(indexer2.getNullifierCount(), 1)
      assert.equal(indexer2.getSyncedBlock(), 1500n)
      assert.equal(indexer2.getSpendableUTXOs().length, 2)
      assert.equal(indexer2.getSpendableUTXOs('0xtoken1').length, 1)
    })
  })

  describe('scanner integration pattern', () => {
    it('demonstrates typical scanner usage', () => {
      // 1. Scanner initializes indexer (or restores from db)
      const indexer = new NullifierIndexer()

      // 2. Scanner discovers new commitments (UTXOs created)
      const newUTXOs = [
        createMockUTXO({ nullifier: 'nullifier_1', token: '0xtoken1', value: 1000n }),
        createMockUTXO({ nullifier: 'nullifier_2', token: '0xtoken1', value: 2000n }),
        createMockUTXO({ nullifier: 'nullifier_3', token: '0xtoken2', value: 500n })
      ]
      indexer.addUTXOs(newUTXOs)

      // 3. Scanner discovers nullifier events (spends)
      const nullifierEvents: NullifierEvent[] = [
        { nullifier: 'nullifier_1', txid: '0xtx_spend', blockNumber: 1500n }
      ]
      indexer.processNullifierEvents(nullifierEvents)

      // 4. Scanner updates synced block
      indexer.setSyncedBlock(1500n)

      // 5. Wallet queries spendable UTXOs for transaction building
      const spendableToken1 = indexer.getSpendableUTXOs('0xtoken1')
      assert.equal(spendableToken1.length, 1) // One spent, one unspent
      assert.equal(spendableToken1[0]?.value, 2000n)

      const spendableToken2 = indexer.getSpendableUTXOs('0xtoken2')
      assert.equal(spendableToken2.length, 1)
      assert.equal(spendableToken2[0]?.value, 500n)

      // 6. Scanner detects reorg
      indexer.handleReorg(1400n)

      // 7. UTXO is unspent again
      const afterReorg = indexer.getSpendableUTXOs('0xtoken1')
      assert.equal(afterReorg.length, 2) // Both unspent now

      // 8. Scanner saves state
      const serialized = indexer.serialize()
      assert.equal(typeof serialized.syncedBlock, 'string')

      // Can be saved to db/disk
      // await db.save('indexer-state', JSON.stringify(serialized))
    })
  })
})
