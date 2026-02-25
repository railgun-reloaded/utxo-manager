import test from 'brittle'

import { compareScores, scoreSelection } from '../src/solutions/scoring'

type TestInput = {
  value: bigint;
}

test('scoreSelection: calculates correct score', (t) => {
  const inputs: TestInput[] = [{ value: 50n }, { value: 30n }, { value: 20n }]
  const target = 100n

  const score = scoreSelection(inputs, target)

  t.is(score.inputCount, 3, 'Should count inputs correctly')
  t.is(score.changeAmount, 0n, 'Should calculate change correctly')
  t.is(score.isExactMatch, true, 'Should detect exact match')
})

test('scoreSelection: detects non-exact match', (t) => {
  const inputs: TestInput[] = [{ value: 60n }, { value: 50n }]
  const target = 100n

  const score = scoreSelection(inputs, target)

  t.is(score.inputCount, 2)
  t.is(score.changeAmount, 10n)
  t.is(score.isExactMatch, false, 'Should not be exact match')
})

test('compareScores: exact match beats non-exact', (t) => {
  const exact = { inputCount: 5, changeAmount: 0n, isExactMatch: true }
  const nonExact = { inputCount: 1, changeAmount: 10n, isExactMatch: false }

  const result = compareScores(exact, nonExact)

  t.ok(result < 0, 'Exact match should win even with more inputs')
})

test('compareScores: fewer inputs beats more inputs (same change)', (t) => {
  const fewer = { inputCount: 2, changeAmount: 10n, isExactMatch: false }
  const more = { inputCount: 5, changeAmount: 10n, isExactMatch: false }

  const result = compareScores(fewer, more)

  t.ok(result < 0, 'Fewer inputs should win')
})

test('compareScores: less change beats more change (same inputs)', (t) => {
  const lessChange = { inputCount: 3, changeAmount: 5n, isExactMatch: false }
  const moreChange = { inputCount: 3, changeAmount: 20n, isExactMatch: false }

  const result = compareScores(lessChange, moreChange)

  t.ok(result < 0, 'Less change should win')
})

test('compareScores: combined scenario - prioritizes inputs over change', (t) => {
  const fewerInputsMoreChange = { inputCount: 2, changeAmount: 50n, isExactMatch: false }
  const moreInputsLessChange = { inputCount: 5, changeAmount: 5n, isExactMatch: false }

  const result = compareScores(fewerInputsMoreChange, moreInputsLessChange)

  t.ok(result < 0, 'Fewer inputs should win even with more change')
})

test('compareScores: equal scores return 0', (t) => {
  const a = { inputCount: 3, changeAmount: 10n, isExactMatch: false }
  const b = { inputCount: 3, changeAmount: 10n, isExactMatch: false }

  const result = compareScores(a, b)

  t.is(result, 0, 'Equal scores should return 0')
})

test('compareScores: exact match with fewer inputs beats exact with more', (t) => {
  const fewer = { inputCount: 1, changeAmount: 0n, isExactMatch: true }
  const more = { inputCount: 2, changeAmount: 0n, isExactMatch: true }

  const result = compareScores(fewer, more)

  t.ok(result < 0, 'Among exact matches, fewer inputs wins')
})
