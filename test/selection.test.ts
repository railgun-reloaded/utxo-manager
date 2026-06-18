import assert from 'node:assert/strict'
import { test } from 'node:test'

import { selectInputsForTarget } from '../src/index.js'

type TestInput = {
  value: bigint;
}

test('Should respect sortFn for greedy selection', () => {
  const inputs: TestInput[] = [
    { value: 1n },
    { value: 1n },
    { value: 1n },
    { value: 10n },
  ]

  const target = 6n
  const maxInputs = 2

  const asc = selectInputsForTarget(inputs, target, maxInputs, (left, right) => {
    if (left.value > right.value) return 1
    if (left.value < right.value) return -1
    return 0
  })
  assert.equal(asc, undefined, 'Ascending order should fail with tight maxInputs.')

  const desc = selectInputsForTarget(inputs, target, maxInputs, (left, right) => {
    if (left.value < right.value) return 1
    if (left.value > right.value) return -1
    return 0
  })
  assert.ok(desc, 'Descending order should succeed.')
  if (desc) {
    assert.ok(desc.total >= target, 'Descending order should cover the target.')
    assert.equal(desc.inputs.length, 1)
  }
})

test('Should use provided sortFn deterministically', () => {
  const inputs: TestInput[] = [
    { value: 1n },
    { value: 1n },
    { value: 1n },
    { value: 10n },
  ]

  const target = 6n
  const maxInputs = 2

  /**
   * Sort descending by value.
   * @param left - First input
   * @param right - Second input
   * @returns Comparison result
   */
  const sortFn = (left: TestInput, right: TestInput) => {
    if (left.value < right.value) return 1
    if (left.value > right.value) return -1
    return 0
  }

  const result = selectInputsForTarget(inputs, target, maxInputs, sortFn)

  assert.ok(result, 'sortFn should drive selection order.')
  if (result) {
    assert.ok(result.total >= target)
  }
})

test('Should handle duplicate values for exact pair matches', () => {
  const inputs = [
    { value: 3n, id: 'a' },
    { value: 3n, id: 'b' },
  ]

  const result = selectInputsForTarget(inputs, 6n, 2)
  assert.ok(result, 'Should find a pair using duplicate values.')
  assert.equal(result?.inputs.length, 2)
  assert.notEqual(result?.inputs[0], result?.inputs[1])
})
