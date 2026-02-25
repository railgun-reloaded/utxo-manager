import test from 'brittle'

import { selectOptimalInputs } from '../src/solutions/optimal-selection'

type TestInput = {
  value: bigint;
  id?: string;
}

test('Optimal selection: prefers single UTXO over multiple', (t) => {
  const inputs: TestInput[] = [
    { value: 100n, id: 'single' },
    { value: 50n, id: 'a' },
    { value: 30n, id: 'b' },
    { value: 20n, id: 'c' },
    { value: 10n, id: 'd' },
    { value: 5n, id: 'e' },
    { value: 5n, id: 'f' }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 1, 'Should use single input')
  t.is(result!.inputs[0]!.value, 100n, 'Should use the 100n UTXO')
  t.is(result!.score.isExactMatch, true, 'Should be exact match')
})

test('Optimal selection: finds exact match with 2 UTXOs', (t) => {
  const inputs: TestInput[] = [
    { value: 60n, id: 'a' },
    { value: 40n, id: 'b' },
    { value: 30n, id: 'c' },
    { value: 20n, id: 'd' }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 2, 'Should use 2 inputs')
  t.is(result!.total, 100n, 'Should total to 100n')
  t.is(result!.score.isExactMatch, true, 'Should be exact match')
})

test('Optimal selection: minimizes inputs when no exact match', (t) => {
  const inputs: TestInput[] = [
    { value: 70n, id: 'large' },
    { value: 10n, id: 'a' },
    { value: 10n, id: 'b' },
    { value: 10n, id: 'c' },
    { value: 10n, id: 'd' }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  // Should pick 70 + 10 + 10 + 10 = 100 (4 inputs) over all small ones
  // Or 70 + 10 + 10 + 10 + 10 = 110 (5 inputs)
  // Optimal: 70 + 10 + 10 + 10 = 100 (exact with 4)
  t.ok(result!.inputs.length <= 5, 'Should use ≤5 inputs')
  t.ok(result!.total >= 100n, 'Should cover target')
})

test('Optimal selection: minimizes change when input count equal', (t) => {
  const inputs: TestInput[] = [
    { value: 55n, id: 'a' },
    { value: 50n, id: 'b' },
    { value: 50n, id: 'c' }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 2, 'Should use 2 inputs')
  // Should prefer 50 + 50 = 100 (0 change) over 55 + 50 = 105 (5 change)
  t.is(result!.total, 100n, 'Should have exact match')
  t.is(result!.score.changeAmount, 0n, 'Should have zero change')
})

test('Optimal selection: handles insufficient funds', (t) => {
  const inputs: TestInput[] = [
    { value: 30n },
    { value: 20n },
    { value: 10n }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.is(result, undefined, 'Should return undefined when insufficient')
})

test('Optimal selection: respects maxInputs constraint', (t) => {
  const inputs: TestInput[] = Array.from({ length: 20 }, (_, i) => ({
    value: 10n,
    id: `utxo-${i}`
  }))

  const result = selectOptimalInputs(inputs, 100n, 8)

  // With 8 maxInputs, can only get 80n (insufficient for 100n target)
  t.is(result, undefined, 'Should return undefined when maxInputs prevents covering target')
})

test('Optimal selection: respects maxInputs when sufficient', (t) => {
  const inputs: TestInput[] = Array.from({ length: 20 }, (_, i) => ({
    value: 10n,
    id: `utxo-${i}`
  }))

  const result = selectOptimalInputs(inputs, 80n, 8)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 8, 'Should use exactly 8 inputs')
  t.is(result!.total, 80n, 'Should have 8 × 10 = 80')
})

test('Optimal selection: empty inputs returns undefined', (t) => {
  const inputs: TestInput[] = []

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.is(result, undefined, 'Should return undefined for empty inputs')
})

test('Optimal selection: zero target returns undefined', (t) => {
  const inputs: TestInput[] = [{ value: 100n }]

  const result = selectOptimalInputs(inputs, 0n, 10)

  t.is(result, undefined, 'Should return undefined for zero target')
})

test('Optimal selection: prefers larger single UTXO with less change', (t) => {
  const inputs: TestInput[] = [
    { value: 105n, id: 'near' },
    { value: 200n, id: 'far' }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 1, 'Should use single input')
  // Should prefer 105 (5 change) over 200 (100 change)
  t.is(result!.inputs[0]!.value, 105n, 'Should use closer value')
  t.is(result!.score.changeAmount, 5n, 'Should have 5 change')
})

test('Optimal selection: complex scenario from spec example', (t) => {
  // Target = 100, Tree has [100, 50, 30, 20, 10, 5, 5]
  const inputs: TestInput[] = [
    { value: 100n, id: 'exact' },
    { value: 50n },
    { value: 30n },
    { value: 20n },
    { value: 10n },
    { value: 5n },
    { value: 5n }
  ]

  const result = selectOptimalInputs(inputs, 100n, 10)

  t.ok(result, 'Should find solution')
  t.is(result!.inputs.length, 1, 'Should use 1 input (not 6)')
  t.is(result!.inputs[0]!.value, 100n, 'Should pick the 100n UTXO')
  t.is(result!.total, 100n, 'Should be exact')
  t.is(result!.score.changeAmount, 0n, 'Should have zero change')
})
