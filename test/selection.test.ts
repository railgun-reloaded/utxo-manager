import test from 'brittle'

import { selectInputsForTarget } from '../src'

type TestInput = {
  value: bigint;
}

test('Should respect sortFn for greedy selection', (t) => {
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
  t.is(asc, undefined, 'Ascending order should fail with tight maxInputs.')

  const desc = selectInputsForTarget(inputs, target, maxInputs, (left, right) => {
    if (left.value < right.value) return 1
    if (left.value > right.value) return -1
    return 0
  })
  t.ok(desc, 'Descending order should succeed.')
  if (desc) {
    t.ok(desc.total >= target, 'Descending order should cover the target.')
    t.is(desc.inputs.length, 1)
  }
})

test('Should use provided sortFn deterministically', (t) => {
  const inputs: TestInput[] = [
    { value: 1n },
    { value: 1n },
    { value: 1n },
    { value: 10n },
  ]

  const target = 6n
  const maxInputs = 2

  /**
   *
   * @param left
   * @param right
   */
  const sortFn = (left: TestInput, right: TestInput) => {
    if (left.value < right.value) return 1
    if (left.value > right.value) return -1
    return 0
  }

  const result = selectInputsForTarget(inputs, target, maxInputs, sortFn)

  t.ok(result, 'sortFn should drive selection order.')
  if (result) {
    t.ok(result.total >= target)
  }
})

test('Should handle duplicate values for exact pair matches', (t) => {
  const inputs = [
    { value: 3n, id: 'a' },
    { value: 3n, id: 'b' },
  ]

  const result = selectInputsForTarget(inputs, 6n, 2)
  t.ok(result, 'Should find a pair using duplicate values.')
  t.is(result?.inputs.length, 2)
  t.not(result?.inputs[0], result?.inputs[1])
})
