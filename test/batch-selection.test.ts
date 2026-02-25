import test from 'brittle'

import { selectBatchesForTarget } from '../src/solutions/batch-selection'

type TestInput = {
  value: bigint;
  treeNumber: bigint;
  id?: string;
}

test('Single batch sufficient - returns one batch with ≤10 inputs', (t) => {
  const inputs: TestInput[] = [
    { value: 5n, treeNumber: 0n },
    { value: 10n, treeNumber: 0n },
    { value: 15n, treeNumber: 0n },
  ]

  const result = selectBatchesForTarget(inputs, 20n, 10)

  t.is(result.length, 1, 'Should return single batch')
  t.ok(result[0]!.total >= 20n, 'Batch should cover target')
  t.ok(result[0]!.inputs.length <= 10, 'Batch should have ≤10 inputs')
  t.is(result[0]!.treeNumber, 0n, 'Batch should be from tree 0')
})

test('Two batches needed - 11 UTXOs from same tree', (t) => {
  const inputs: TestInput[] = Array.from({ length: 11 }, (_, i) => ({
    value: 10n,
    treeNumber: 0n,
    id: `utxo-${i}`
  }))

  const result = selectBatchesForTarget(inputs, 110n, 10)

  t.is(result.length, 2, 'Should return two batches')
  t.is(result[0]!.inputs.length, 10, 'First batch should have 10 inputs')
  t.is(result[1]!.inputs.length, 1, 'Second batch should have 1 input')
  t.is(result[0]!.total, 100n, 'First batch total should be 100n')
  t.is(result[1]!.total, 10n, 'Second batch total should be 10n')

  const totalCovered = result.reduce((sum, batch) => sum + batch.total, 0n)
  t.is(totalCovered, 110n, 'Total should equal target')
})

test('Three+ batches needed - 25 UTXOs', (t) => {
  const inputs: TestInput[] = Array.from({ length: 25 }, (_, i) => ({
    value: 10n,
    treeNumber: 0n,
    id: `utxo-${i}`
  }))

  const result = selectBatchesForTarget(inputs, 250n, 10)

  t.is(result.length, 3, 'Should return three batches')
  t.is(result[0]!.inputs.length, 10, 'First batch should have 10 inputs')
  t.is(result[1]!.inputs.length, 10, 'Second batch should have 10 inputs')
  t.is(result[2]!.inputs.length, 5, 'Third batch should have 5 inputs')

  const totalCovered = result.reduce((sum, batch) => sum + batch.total, 0n)
  t.is(totalCovered, 250n, 'Total should equal target')
})

test('Mixed trees - creates separate batches per tree', (t) => {
  const inputs: TestInput[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ value: 10n, treeNumber: 0n, id: `tree0-${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ value: 10n, treeNumber: 1n, id: `tree1-${i}` })),
  ]

  const result = selectBatchesForTarget(inputs, 120n, 10)

  t.ok(result.length >= 1, 'Should return at least one batch')

  const totalCovered = result.reduce((sum, batch) => sum + batch.total, 0n)
  t.ok(totalCovered >= 120n, 'Should cover target')

  // Verify each batch is from a single tree
  result.forEach((batch, idx) => {
    const treeNumbers = new Set(batch.inputs.map(input => input.treeNumber))
    t.is(treeNumbers.size, 1, `Batch ${idx} should have inputs from single tree`)
  })
})

test('Exact match in single tree - preferred over multiple batches', (t) => {
  const inputs: TestInput[] = [
    { value: 50n, treeNumber: 0n },
    { value: 50n, treeNumber: 0n },
    ...Array.from({ length: 15 }, (_, i) => ({ value: 1n, treeNumber: 1n, id: `tree1-${i}` })),
  ]

  const result = selectBatchesForTarget(inputs, 100n, 10)

  t.is(result.length, 1, 'Should return single batch with exact match')
  t.is(result[0]!.inputs.length, 2, 'Should use 2 inputs for exact match')
  t.is(result[0]!.total, 100n, 'Should exactly match target')
  t.is(result[0]!.treeNumber, 0n, 'Should use tree 0 with exact match')
})

test('Exact match in second tree - should be preferred', (t) => {
  const inputs: TestInput[] = [
    ...Array.from({ length: 15 }, (_, i) => ({ value: 1n, treeNumber: 0n, id: `tree0-${i}` })),
    { value: 50n, treeNumber: 1n },
    { value: 50n, treeNumber: 1n },
  ]

  const result = selectBatchesForTarget(inputs, 100n, 10)

  t.is(result.length, 1, 'Should return single batch with exact match')
  t.is(result[0]!.treeNumber, 1n, 'Should use tree 1 with exact match')
  t.is(result[0]!.total, 100n, 'Should exactly match target')
})

test('Empty inputs - returns empty array', (t) => {
  const inputs: TestInput[] = []

  const result = selectBatchesForTarget(inputs, 100n, 10)

  t.is(result.length, 0, 'Should return empty array')
})

test('Zero target - returns empty array', (t) => {
  const inputs: TestInput[] = [
    { value: 10n, treeNumber: 0n },
  ]

  const result = selectBatchesForTarget(inputs, 0n, 10)

  t.is(result.length, 0, 'Should return empty array')
})

test('Insufficient UTXOs - returns empty array', (t) => {
  const inputs: TestInput[] = [
    { value: 10n, treeNumber: 0n },
    { value: 20n, treeNumber: 0n },
  ]

  const result = selectBatchesForTarget(inputs, 100n, 10)

  t.is(result.length, 0, 'Should return empty array when target cannot be met')
})

test('Respects sortFn - ascending order', (t) => {
  const inputs: TestInput[] = [
    { value: 100n, treeNumber: 0n, id: 'large' },
    { value: 1n, treeNumber: 0n, id: 'small1' },
    { value: 1n, treeNumber: 0n, id: 'small2' },
    { value: 1n, treeNumber: 0n, id: 'small3' },
  ]

  /**
   * Sort inputs by ascending value.
   * @param left - First input
   * @param right - Second input
   * @returns Comparison result
   */
  const sortAscending = (left: TestInput, right: TestInput) => {
    if (left.value > right.value) return 1
    if (left.value < right.value) return -1
    return 0
  }

  const result = selectBatchesForTarget(inputs, 3n, 10, sortAscending)

  t.is(result.length, 1, 'Should return single batch')
  t.is(result[0]!.inputs.length, 3, 'Should use 3 small inputs')
  t.ok(result[0]!.inputs.every(input => input.value === 1n), 'Should use smallest inputs first')
})

test('Respects sortFn - descending order', (t) => {
  const inputs: TestInput[] = [
    { value: 100n, treeNumber: 0n, id: 'large' },
    { value: 1n, treeNumber: 0n, id: 'small1' },
    { value: 1n, treeNumber: 0n, id: 'small2' },
    { value: 1n, treeNumber: 0n, id: 'small3' },
  ]

  /**
   * Sort inputs by descending value.
   * @param left - First input
   * @param right - Second input
   * @returns Comparison result
   */
  const sortDescending = (left: TestInput, right: TestInput) => {
    if (left.value < right.value) return 1
    if (left.value > right.value) return -1
    return 0
  }

  const result = selectBatchesForTarget(inputs, 100n, 10, sortDescending)

  t.is(result.length, 1, 'Should return single batch')
  t.is(result[0]!.inputs.length, 1, 'Should use single large input')
  t.is(result[0]!.inputs[0]!.value, 100n, 'Should use largest input first')
})

test('Batches do not reuse inputs', (t) => {
  const inputs: TestInput[] = Array.from({ length: 15 }, (_, i) => ({
    value: 10n,
    treeNumber: 0n,
    id: `utxo-${i}`
  }))

  const result = selectBatchesForTarget(inputs, 150n, 10)

  const allInputIds = new Set<string>()
  result.forEach(batch => {
    batch.inputs.forEach(input => {
      const inputId = input.id!
      t.ok(!allInputIds.has(inputId), `Input ${inputId} should not be reused`)
      allInputIds.add(inputId)
    })
  })

  t.is(allInputIds.size, 15, 'Should use all 15 unique inputs')
})

test('Cross-tree selection when single tree insufficient', (t) => {
  const inputs: TestInput[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ value: 5n, treeNumber: 0n, id: `tree0-${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ value: 5n, treeNumber: 1n, id: `tree1-${i}` })),
  ]

  // Need 100n total, tree0 can only provide 50n max
  const result = selectBatchesForTarget(inputs, 100n, 10)

  t.ok(result.length >= 2, 'Should need multiple batches')

  const totalCovered = result.reduce((sum, batch) => sum + batch.total, 0n)
  t.is(totalCovered, 100n, 'Should cover full target')

  const tree0Batches = result.filter(b => b.treeNumber === 0n)
  const tree1Batches = result.filter(b => b.treeNumber === 1n)

  t.ok(tree0Batches.length > 0, 'Should use tree 0')
  t.ok(tree1Batches.length > 0, 'Should use tree 1')
})
