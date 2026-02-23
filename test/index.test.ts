import type { Test } from 'brittle'
import test from 'brittle'

import type { Input, OutputSolution, SpendingSolutionInput } from '../src/index'
import { SpendingSolution, getSpendingSolution } from '../src/index'

/**
 * Create random test inputs.
 * @param count - Number of inputs
 * @returns Test inputs
 */
function createRandomTestInputs (count: number): Input[] {
  const inputs: Input[] = []
  for (let i = 0; i < count; i++) {
    inputs.push({
      commitmentIndex: BigInt(i),
      treeNumber: BigInt(Math.floor(Math.random() * 16)),
      value: BigInt(Math.floor(Math.random() * 10000) + 1)
    })
  }
  return inputs
}

/**
 * Validate test case.
 * @param t - Test instance
 * @param desiredSolution - Expected solution
 * @param solution - Actual solution
 */
function validateRandomTestCase (t: Test, desiredSolution: SpendingSolutionInput, solution: OutputSolution): void {
  // console.log("Desired Amount", desiredSolution.amount);
  // console.log('Generated Solution:', solution);
  // validate inputs
  t.ok(solution.inputs.length > 0, 'Solution should include inputs.')
  t.is(solution.outputs.length, 2, 'Solution Simple: should include 2 outputs.')

  // validate outputs
  let totalOutputValue = 0n
  solution.outputs.forEach((output) => {
    totalOutputValue += output.value
  })

  t.ok(totalOutputValue >= desiredSolution.amount, 'Solution amount should match or exceed desired amount.')
  t.ok(solution.outputs.some(output => output.recipientAddress === desiredSolution.recipientAddress), 'Solution should include the recipient address.')
}

/**
 * Run random test cases.
 * @param t - Test instance
 * @param testCaseCount - Number of test cases
 */
function runRandomTestCases (t: Test, testCaseCount: number): void {
  for (let i = 0; i < testCaseCount; i++) {
    const testInputs = createRandomTestInputs(100)
    const changeAddress = `0zkaddress${Math.random().toString(36).substring(2, 10)}CHANGE`
    const desiredSolution: SpendingSolutionInput = {
      recipientAddress: `0zkaddress${Math.random().toString(36).substring(2, 10)}`,
      inputs: testInputs,
      amount: BigInt(Math.floor(Math.random() * 20_000) + 1),
      type: SpendingSolution.Simple,
      changeAddress
    }

    const solution = getSpendingSolution(desiredSolution)
    t.ok(solution, 'Solution should be defined.')
    if (solution) {
      validateRandomTestCase(t, desiredSolution, solution)
    }
  }
}

test('Should pass all randomized test cases.', (t) => {
  runRandomTestCases(t, 32)
})

test('Should generate a valid solution for random inputs.', (t) => {
  const testInputs = createRandomTestInputs(5)
  const desiredSolution: SpendingSolutionInput = {
    recipientAddress: '0zkaddressRandom',
    inputs: testInputs,
    amount: 500n,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange'
  }

  const solution = getSpendingSolution(desiredSolution)
  t.ok(solution, 'Solution should be defined.')
  // console.log('Generated Solution:', solution);

  if (solution) {
    t.ok(solution.inputs.length > 0, 'Solution should include inputs.')
    // get map amount
    let amount = 0n
    solution.outputs.forEach((acc) => {
      amount += acc.value
    })
    // console.log(amount, desiredSolution)
    t.ok(amount >= desiredSolution.amount, 'Solution amount should match desired amount.')
  }
})

test('Should handle edge cases with no inputs.', (t) => {
  const desiredSolution: SpendingSolutionInput = {
    recipientAddress: '0zkaddressEdgeCase',
    inputs: [],
    amount: 0n,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',

  }

  const solution = getSpendingSolution(desiredSolution)
  t.is(solution, undefined, 'Solution should be undefined.')
})

test('Should handle large input values.', (t) => {
  const testInputs: Input[] = [
    { commitmentIndex: 0n, treeNumber: 0n, value: 10_000n },
    { commitmentIndex: 1n, treeNumber: 0n, value: 20_000n },
  ]

  const desiredSolution: SpendingSolutionInput = {
    recipientAddress: '0zkaddressLargeValues',
    inputs: testInputs,
    amount: 25_000n,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',

  }

  const solution = getSpendingSolution(desiredSolution)
  t.ok(solution, 'Solution should be defined.')
  // console.log('Large Values Solution:', solution);

  if (solution) {
    t.ok(solution.inputs.length > 0, 'Solution should include inputs.')
  }
  // assert(solution.outputs[0]?.value === desiredSolution.amount, "Solution amount should match desired amount.");
})

test('Should pick the most efficient solution and prefer larger change on ties.', (t) => {
  const changeAddress = '0zkaddressChange'
  const recipientAddress = '0zkaddressRecipient'
  const desiredSolution: SpendingSolutionInput = {
    recipientAddress,
    inputs: [
      { commitmentIndex: 0n, treeNumber: 1n, value: 6n },
      { commitmentIndex: 1n, treeNumber: 1n, value: 6n },
      { commitmentIndex: 2n, treeNumber: 2n, value: 9n },
      { commitmentIndex: 3n, treeNumber: 2n, value: 11n },
    ],
    amount: 10n,
    type: SpendingSolution.Simple,
    changeAddress,
  }

  const solution = getSpendingSolution(desiredSolution)
  t.ok(solution, 'Solution should be defined.')
  if (solution) {
    t.is(solution.inputs[0]?.treeNumber, 2n, 'Should select tree with larger change.')

    const changeOutput = solution.outputs.find(
      (output) => output.recipientAddress === changeAddress
    )
    t.is(changeOutput?.value, 10n, 'Should prefer solution with larger change.')
  }
})

test('Should choose the last solution if it has better efficiency.', (t) => {
  const changeAddress = '0zkaddressChange'
  const recipientAddress = '0zkaddressRecipient'
  const desiredSolution: SpendingSolutionInput = {
    recipientAddress,
    inputs: [
      { commitmentIndex: 0n, treeNumber: 1n, value: 3n },
      { commitmentIndex: 1n, treeNumber: 1n, value: 3n },
      { commitmentIndex: 2n, treeNumber: 1n, value: 4n },
      { commitmentIndex: 3n, treeNumber: 2n, value: 5n },
      { commitmentIndex: 4n, treeNumber: 2n, value: 5n },
    ],
    amount: 10n,
    type: SpendingSolution.Simple,
    changeAddress,
  }

  const solution = getSpendingSolution(desiredSolution)
  t.ok(solution, 'Solution should be defined.')
  if (solution) {
    t.is(solution.inputs.length, 2, 'Should choose the more efficient 2-input solution.')
    t.is(solution.inputs[0]?.treeNumber, 2n, 'Should select the later tree with better efficiency.')
  }
})
