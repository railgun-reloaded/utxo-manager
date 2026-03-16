import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { UTXO, NullifierEvent } from '../../src'
import { NullifierIndexer, fromHex, toHex } from '../../src'

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
      const testCommitment = fromHex('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
      const utxo = createMockUTXO({ commitment: testCommitment })

      indexer.addUTXO(utxo)

      assert.equal(indexer.getUTXOCount(), 1)
      const retrieved = indexer.getUTXO(testCommitment)
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
      const testNullifier = fromHex('fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      indexer.addUTXO(utxo)

      // Scanner detects nullifier event
      const events: NullifierEvent[] = [
        {
          nullifier: testNullifier,
          txid: '0xtxid_123',
          blockNumber: 1500n
        }
      ]

      // Scanner feeds events downstream to indexer
      indexer.processNullifierEvents(events)

      // Verify UTXO is now marked spent
      assert.equal(indexer.isSpent(testNullifier), true)
      assert.equal(indexer.getNullifierCount(), 1)

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 0)
    })

    it('handles batch of events from scanner', () => {
      const indexer = new NullifierIndexer()
      const nullifier1 = fromHex('1111111111111111111111111111111111111111111111111111111111111111')
      const nullifier2 = fromHex('2222222222222222222222222222222222222222222222222222222222222222')
      const nullifier3 = fromHex('3333333333333333333333333333333333333333333333333333333333333333')
      const utxo1 = createMockUTXO({ nullifier: nullifier1 })
      const utxo2 = createMockUTXO({ nullifier: nullifier2 })
      const utxo3 = createMockUTXO({ nullifier: nullifier3 })
      indexer.addUTXOs([utxo1, utxo2, utxo3])

      // Scanner provides batch of events
      const events: NullifierEvent[] = [
        { nullifier: nullifier1, txid: '0xtx1', blockNumber: 1500n },
        { nullifier: nullifier2, txid: '0xtx2', blockNumber: 1501n }
      ]

      indexer.processNullifierEvents(events)

      assert.equal(indexer.getNullifierCount(), 2)
      assert.equal(indexer.isSpent(nullifier1), true)
      assert.equal(indexer.isSpent(nullifier2), true)
      assert.equal(indexer.isSpent(nullifier3), false)
    })

    it('handles events for unknown nullifiers gracefully', () => {
      const indexer = new NullifierIndexer()
      const knownNullifier = fromHex('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      const unknownNullifier = fromHex('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
      const utxo = createMockUTXO({ nullifier: knownNullifier })
      indexer.addUTXO(utxo)

      // Scanner sees nullifier for UTXO we don't own
      const events: NullifierEvent[] = [
        { nullifier: unknownNullifier, txid: '0xtx', blockNumber: 1500n }
      ]

      indexer.processNullifierEvents(events)

      // Should not crash, nullifier is tracked but no UTXO matches
      assert.equal(indexer.getNullifierCount(), 1)
      assert.equal(indexer.isSpent(unknownNullifier), true)
    })
  })

  describe('handleReorg', () => {
    it('reverts spent UTXOs after reorg', () => {
      const indexer = new NullifierIndexer()
      const testNullifier = fromHex('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      indexer.addUTXO(utxo)

      // UTXO spent at block 1500
      const events: NullifierEvent[] = [
        { nullifier: testNullifier, txid: '0xtx', blockNumber: 1500n }
      ]
      indexer.processNullifierEvents(events)

      assert.equal(indexer.isSpent(testNullifier), true)

      // Chain reorgs to block 1400
      indexer.handleReorg(1400n)

      // UTXO should be unspent again
      assert.equal(indexer.isSpent(testNullifier), false)
      assert.equal(indexer.getNullifierCount(), 0)

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 1)
    })

    it('keeps UTXOs spent before reorg point', () => {
      const indexer = new NullifierIndexer()
      const nullifierEarly = fromHex('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd')
      const nullifierLate = fromHex('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
      const utxo1 = createMockUTXO({ nullifier: nullifierEarly })
      const utxo2 = createMockUTXO({ nullifier: nullifierLate })
      indexer.addUTXOs([utxo1, utxo2])

      // Spend at different blocks
      indexer.processNullifierEvents([
        { nullifier: nullifierEarly, txid: '0xtx1', blockNumber: 1000n },
        { nullifier: nullifierLate, txid: '0xtx2', blockNumber: 1500n }
      ])

      // Reorg to block 1200
      indexer.handleReorg(1200n)

      // Early spend is kept, late spend is reverted
      assert.equal(indexer.isSpent(nullifierEarly), true)
      assert.equal(indexer.isSpent(nullifierLate), false)
      assert.equal(indexer.getNullifierCount(), 1)
    })
  })

  describe('query methods', () => {
    it('getSpendableUTXOs returns only unspent', () => {
      const indexer = new NullifierIndexer()
      const token1 = fromHex('0000000000000000000000000000000000000001')
      const spentNullifier = fromHex('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      const unspent = createMockUTXO({ token: token1 })
      const spent = createMockUTXO({ token: token1, nullifier: spentNullifier })
      indexer.addUTXOs([unspent, spent])

      indexer.processNullifierEvents([
        { nullifier: spentNullifier, txid: '0xtx', blockNumber: 1500n }
      ])

      const spendable = indexer.getSpendableUTXOs()
      assert.equal(spendable.length, 1)
      assert.equal(spendable[0]?.spent, false)
    })

    it('getSpendableUTXOs filters by token', () => {
      const indexer = new NullifierIndexer()
      const token1Bytes = fromHex('0000000000000000000000000000000000000001')
      const token2Bytes = fromHex('0000000000000000000000000000000000000002')
      const token1 = createMockUTXO({ token: token1Bytes })
      const token2 = createMockUTXO({ token: token2Bytes })
      indexer.addUTXOs([token1, token2])

      const spendable = indexer.getSpendableUTXOs(token1Bytes)
      assert.equal(spendable.length, 1)
      assert.equal(toHex(spendable[0]?.token || new Uint8Array()), toHex(token1Bytes))
    })

    it('getAllUTXOs returns all UTXOs', () => {
      const indexer = new NullifierIndexer()
      const spentNullifier = fromHex('1010101010101010101010101010101010101010101010101010101010101010')
      const utxo1 = createMockUTXO()
      const utxo2 = createMockUTXO({ nullifier: spentNullifier })
      indexer.addUTXOs([utxo1, utxo2])

      indexer.processNullifierEvents([
        { nullifier: spentNullifier, txid: '0xtx', blockNumber: 1500n }
      ])

      const all = indexer.getAllUTXOs()
      assert.equal(all.length, 2)
    })

    it('isSpent checks nullifier index', () => {
      const indexer = new NullifierIndexer()
      const testNullifier = fromHex('2020202020202020202020202020202020202020202020202020202020202020')
      const utxo = createMockUTXO({ nullifier: testNullifier })
      indexer.addUTXO(utxo)

      assert.equal(indexer.isSpent(testNullifier), false)

      indexer.processNullifierEvents([
        { nullifier: testNullifier, txid: '0xtx', blockNumber: 1500n }
      ])

      assert.equal(indexer.isSpent(testNullifier), true)
    })

    it('getUTXO retrieves by commitment', () => {
      const indexer = new NullifierIndexer()
      const testCommitment = fromHex('3030303030303030303030303030303030303030303030303030303030303030')
      const utxo = createMockUTXO({ commitment: testCommitment })
      indexer.addUTXO(utxo)

      const retrieved = indexer.getUTXO(testCommitment)
      assert.deepEqual(retrieved, utxo)

      const notFound = indexer.getUTXO(fromHex('unknown123'))
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
      const testCommitment = fromHex('4040404040404040404040404040404040404040404040404040404040404040')
      const utxo = createMockUTXO({ commitment: testCommitment })
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

      const token1Bytes = fromHex('0000000000000000000000000000000000000001')
      const token2Bytes = fromHex('0000000000000000000000000000000000000002')
      const n1 = fromHex('5050505050505050505050505050505050505050505050505050505050505050')
      const n2 = fromHex('6060606060606060606060606060606060606060606060606060606060606060')
      const n3 = fromHex('7070707070707070707070707070707070707070707070707070707070707070')

      // Add multiple UTXOs with various states
      const utxos = [
        createMockUTXO({ token: token1Bytes, nullifier: n1 }),
        createMockUTXO({ token: token2Bytes, nullifier: n2 }),
        createMockUTXO({ token: token1Bytes, nullifier: n3 })
      ]
      indexer1.addUTXOs(utxos)

      // Spend some
      indexer1.processNullifierEvents([
        { nullifier: n1, txid: '0xtx1', blockNumber: 1500n }
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
      assert.equal(indexer2.getSpendableUTXOs(token1Bytes).length, 1)
    })
  })

  describe('scanner integration pattern', () => {
    it('demonstrates typical scanner usage', () => {
      // 1. Scanner initializes indexer (or restores from db)
      const indexer = new NullifierIndexer()

      const token1Bytes = fromHex('0000000000000000000000000000000000000001')
      const token2Bytes = fromHex('0000000000000000000000000000000000000002')
      const nullifier1 = fromHex('8080808080808080808080808080808080808080808080808080808080808080')
      const nullifier2 = fromHex('9090909090909090909090909090909090909090909090909090909090909090')
      const nullifier3 = fromHex('a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0')

      // 2. Scanner discovers new commitments (UTXOs created)
      const newUTXOs = [
        createMockUTXO({ nullifier: nullifier1, token: token1Bytes, value: 1000n }),
        createMockUTXO({ nullifier: nullifier2, token: token1Bytes, value: 2000n }),
        createMockUTXO({ nullifier: nullifier3, token: token2Bytes, value: 500n })
      ]
      indexer.addUTXOs(newUTXOs)

      // 3. Scanner discovers nullifier events (spends)
      const nullifierEvents: NullifierEvent[] = [
        { nullifier: nullifier1, txid: '0xtx_spend', blockNumber: 1500n }
      ]
      indexer.processNullifierEvents(nullifierEvents)

      // 4. Scanner updates synced block
      indexer.setSyncedBlock(1500n)

      // 5. Wallet queries spendable UTXOs for transaction building
      const spendableToken1 = indexer.getSpendableUTXOs(token1Bytes)
      assert.equal(spendableToken1.length, 1) // One spent, one unspent
      assert.equal(spendableToken1[0]?.value, 2000n)

      const spendableToken2 = indexer.getSpendableUTXOs(token2Bytes)
      assert.equal(spendableToken2.length, 1)
      assert.equal(spendableToken2[0]?.value, 500n)

      // 6. Scanner detects reorg
      indexer.handleReorg(1400n)

      // 7. UTXO is unspent again
      const afterReorg = indexer.getSpendableUTXOs(token1Bytes)
      assert.equal(afterReorg.length, 2) // Both unspent now

      // 8. Scanner saves state
      const serialized = indexer.serialize()
      assert.equal(typeof serialized.syncedBlock, 'string')

      // Can be saved to db/disk
      // await db.save('indexer-state', JSON.stringify(serialized))
    })
  })
})
