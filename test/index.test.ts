import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Input, OutputSolution, SpendingSolutionInput } from '../src/index'
import { NFTNotOwnedOrSpentError, SpendingSolution, TokenType, getSpendingSolution } from '../src/index'

const ERC20_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ERC20_TOKEN_SUB_ID = `0x${'00'.repeat(32)}`
const NFT_COLLECTION = '0x858Df9F84C73E01c55A2DFB95825401242a65D64'

/**
 * Build an ERC20-identity ERC20 spend intent with the given overrides.
 * @param overrides - Fields to override on top of the ERC20 defaults.
 * @returns A `SpendingSolutionInput` carrying the canonical ERC20 identity.
 */
function makeERC20Solution (overrides: Partial<SpendingSolutionInput>): SpendingSolutionInput {
  return {
    recipientAddress: '0zkaddressRecipient',
    inputs: [],
    amount: 0n,
    tokenAddress: ERC20_TOKEN_ADDRESS,
    tokenType: TokenType.ERC20,
    tokenSubID: ERC20_TOKEN_SUB_ID,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
    ...overrides,
  }
}

/**
 * Build an ERC20 input with the given overrides.
 * @param overrides - Fields to override on top of the ERC20 input defaults.
 * @returns An `Input` carrying the canonical ERC20 identity.
 */
function makeERC20Input (overrides: Partial<Input>): Input {
  return {
    commitmentIndex: 0n,
    treeNumber: 0n,
    value: 0n,
    tokenAddress: ERC20_TOKEN_ADDRESS,
    tokenType: TokenType.ERC20,
    tokenSubID: ERC20_TOKEN_SUB_ID,
    ...overrides,
  }
}

/**
 * Build an ERC721 input for a specific token ID under the test collection.
 * @param tokenSubID - 0x-prefixed token ID (32-byte hex).
 * @param overrides - Additional field overrides.
 * @returns An ERC721 `Input` with `value: 1n` (protocol invariant).
 */
function makeNFTInput (tokenSubID: string, overrides: Partial<Input> = {}): Input {
  return {
    commitmentIndex: 0n,
    treeNumber: 0n,
    value: 1n,
    tokenAddress: NFT_COLLECTION,
    tokenType: TokenType.ERC721,
    tokenSubID,
    ...overrides,
  }
}

/**
 * Create random test inputs.
 * @param count - Number of inputs
 * @returns Test inputs
 */
function createRandomTestInputs (count: number): Input[] {
  const inputs: Input[] = []
  for (let i = 0; i < count; i++) {
    inputs.push(makeERC20Input({
      commitmentIndex: BigInt(i),
      treeNumber: BigInt(Math.floor(Math.random() * 16)),
      value: BigInt(Math.floor(Math.random() * 10000) + 1),
    }))
  }
  return inputs
}

/**
 * Validate test case.
 * @param desiredSolution - Expected solution
 * @param solution - Actual solution
 */
function validateRandomTestCase (desiredSolution: SpendingSolutionInput, solution: OutputSolution): void {
  // console.log("Desired Amount", desiredSolution.amount);
  // console.log('Generated Solution:', solution);
  // validate inputs
  assert.ok(solution.inputs.length > 0, 'Solution should include inputs.')
  assert.equal(solution.outputs.length, 2, 'Solution Simple: should include 2 outputs.')

  // validate outputs
  let totalOutputValue = 0n
  solution.outputs.forEach((output) => {
    totalOutputValue += output.value
  })

  assert.ok(totalOutputValue >= desiredSolution.amount, 'Solution amount should match or exceed desired amount.')
  assert.ok(solution.outputs.some(output => output.recipientAddress === desiredSolution.recipientAddress), 'Solution should include the recipient address.')
}

/**
 * Run random test cases.
 * @param testCaseCount - Number of test cases
 */
function runRandomTestCases (testCaseCount: number): void {
  for (let i = 0; i < testCaseCount; i++) {
    const testInputs = createRandomTestInputs(100)
    const changeAddress = `0zkaddress${Math.random().toString(36).substring(2, 10)}CHANGE`
    const desiredSolution = makeERC20Solution({
      recipientAddress: `0zkaddress${Math.random().toString(36).substring(2, 10)}`,
      inputs: testInputs,
      amount: BigInt(Math.floor(Math.random() * 20_000) + 1),
      changeAddress,
    })

    const solution = getSpendingSolution(desiredSolution)
    assert.ok(solution, 'Solution should be defined.')
    if (solution) {
      validateRandomTestCase(desiredSolution, solution)
    }
  }
}

test('Should pass all randomized test cases.', () => {
  runRandomTestCases(32)
})

test('Should generate a valid solution for random inputs.', () => {
  const testInputs = createRandomTestInputs(5)
  const desiredSolution = makeERC20Solution({
    recipientAddress: '0zkaddressRandom',
    inputs: testInputs,
    amount: 500n,
  })

  const solution = getSpendingSolution(desiredSolution)
  assert.ok(solution, 'Solution should be defined.')
  // console.log('Generated Solution:', solution);

  if (solution) {
    assert.ok(solution.inputs.length > 0, 'Solution should include inputs.')
    // get map amount
    let amount = 0n
    solution.outputs.forEach((acc) => {
      amount += acc.value
    })
    // console.log(amount, desiredSolution)
    assert.ok(amount >= desiredSolution.amount, 'Solution amount should match desired amount.')
  }
})

test('Should handle edge cases with no inputs.', () => {
  const desiredSolution = makeERC20Solution({
    recipientAddress: '0zkaddressEdgeCase',
    inputs: [],
    amount: 0n,
  })

  const solution = getSpendingSolution(desiredSolution)
  assert.equal(solution, undefined, 'Solution should be undefined.')
})

test('Should handle large input values.', () => {
  const testInputs: Input[] = [
    makeERC20Input({ commitmentIndex: 0n, treeNumber: 0n, value: 10_000n }),
    makeERC20Input({ commitmentIndex: 1n, treeNumber: 0n, value: 20_000n }),
  ]

  const desiredSolution = makeERC20Solution({
    recipientAddress: '0zkaddressLargeValues',
    inputs: testInputs,
    amount: 25_000n,
  })

  const solution = getSpendingSolution(desiredSolution)
  assert.ok(solution, 'Solution should be defined.')
  // console.log('Large Values Solution:', solution);

  if (solution) {
    assert.ok(solution.inputs.length > 0, 'Solution should include inputs.')
  }
  // assert(solution.outputs[0]?.value === desiredSolution.amount, "Solution amount should match desired amount.");
})

test('Should pick the most efficient solution and prefer larger change on ties.', () => {
  const changeAddress = '0zkaddressChange'
  const recipientAddress = '0zkaddressRecipient'
  const desiredSolution = makeERC20Solution({
    recipientAddress,
    inputs: [
      makeERC20Input({ commitmentIndex: 0n, treeNumber: 1n, value: 6n }),
      makeERC20Input({ commitmentIndex: 1n, treeNumber: 1n, value: 6n }),
      makeERC20Input({ commitmentIndex: 2n, treeNumber: 2n, value: 9n }),
      makeERC20Input({ commitmentIndex: 3n, treeNumber: 2n, value: 11n }),
    ],
    amount: 10n,
    changeAddress,
  })

  const solution = getSpendingSolution(desiredSolution)
  assert.ok(solution, 'Solution should be defined.')
  if (solution) {
    assert.equal(solution.inputs[0]?.treeNumber, 2n, 'Should select tree with larger change.')

    const changeOutput = solution.outputs.find(
      (output) => output.recipientAddress === changeAddress
    )
    assert.equal(changeOutput?.value, 10n, 'Should prefer solution with larger change.')
  }
})

test('Should choose the last solution if it has better efficiency.', () => {
  const changeAddress = '0zkaddressChange'
  const recipientAddress = '0zkaddressRecipient'
  const desiredSolution = makeERC20Solution({
    recipientAddress,
    inputs: [
      makeERC20Input({ commitmentIndex: 0n, treeNumber: 1n, value: 3n }),
      makeERC20Input({ commitmentIndex: 1n, treeNumber: 1n, value: 3n }),
      makeERC20Input({ commitmentIndex: 2n, treeNumber: 1n, value: 4n }),
      makeERC20Input({ commitmentIndex: 3n, treeNumber: 2n, value: 5n }),
      makeERC20Input({ commitmentIndex: 4n, treeNumber: 2n, value: 5n }),
    ],
    amount: 10n,
    changeAddress,
  })

  const solution = getSpendingSolution(desiredSolution)
  assert.ok(solution, 'Solution should be defined.')
  if (solution) {
    assert.equal(solution.inputs.length, 2, 'Should choose the more efficient 2-input solution.')
    assert.equal(solution.inputs[0]?.treeNumber, 2n, 'Should select the later tree with better efficiency.')
  }
})

test('ERC721 happy path: returns the single matching input and no change output', () => {
  const tokenId = `0x${'00'.repeat(31)}07`
  const inputs: Input[] = [
    makeNFTInput(tokenId, { commitmentIndex: 0n, treeNumber: 1n }),
    makeNFTInput(`0x${'00'.repeat(31)}09`, { commitmentIndex: 1n, treeNumber: 1n }),
  ]

  const solution = getSpendingSolution({
    recipientAddress: '0zkaddressNFTRecipient',
    inputs,
    amount: 1n,
    tokenAddress: NFT_COLLECTION,
    tokenType: TokenType.ERC721,
    tokenSubID: tokenId,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
  })

  assert.ok(solution, 'Solution should be defined.')
  if (solution) {
    assert.equal(solution.inputs.length, 1, 'one input picked')
    assert.equal(solution.inputs[0]?.tokenSubID, tokenId, 'correct token ID selected')
    assert.equal(solution.outputs.length, 1, 'no change output for ERC721 (valueIn - valueOut = 0)')
    assert.equal(solution.outputs[0]?.value, 1n)
    assert.equal(solution.outputs[0]?.tokenSubID, tokenId)
  }
})

test('ERC721 unowned: throws NFTNotOwnedOrSpentError', () => {
  const ownedId = `0x${'00'.repeat(31)}01`
  const unownedId = `0x${'00'.repeat(31)}99`
  const inputs: Input[] = [
    makeNFTInput(ownedId, { commitmentIndex: 0n, treeNumber: 1n }),
  ]

  assert.throws(
    () => getSpendingSolution({
      recipientAddress: '0zkaddressNFTRecipient',
      inputs,
      amount: 1n,
      tokenAddress: NFT_COLLECTION,
      tokenType: TokenType.ERC721,
      tokenSubID: unownedId,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange',
    }),
    (err: unknown) => {
      assert.ok(err instanceof NFTNotOwnedOrSpentError)
      assert.equal(err.collection, NFT_COLLECTION)
      assert.equal(err.tokenId, unownedId)
      return true
    }
  )
})

test('ERC721 wrong collection: throws NFTNotOwnedOrSpentError', () => {
  const ownedId = `0x${'00'.repeat(31)}01`
  const inputs: Input[] = [
    makeNFTInput(ownedId, { commitmentIndex: 0n, treeNumber: 1n }),
  ]

  const otherCollection = '0xDeaDBeefDeAdBeEfDeAdBEEFdEadbEEFdeadBEEf'

  assert.throws(
    () => getSpendingSolution({
      recipientAddress: '0zkaddressNFTRecipient',
      inputs,
      amount: 1n,
      tokenAddress: otherCollection,
      tokenType: TokenType.ERC721,
      tokenSubID: ownedId,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange',
    }),
    (err: unknown) => {
      assert.ok(err instanceof NFTNotOwnedOrSpentError)
      assert.equal(err.collection, otherCollection)
      return true
    }
  )
})

test('ERC721 amount must be 1: throws when amount != 1', () => {
  const tokenId = `0x${'00'.repeat(31)}01`
  const inputs: Input[] = [makeNFTInput(tokenId, { commitmentIndex: 0n, treeNumber: 1n })]

  assert.throws(
    () => getSpendingSolution({
      recipientAddress: '0zkaddressNFTRecipient',
      inputs,
      amount: 2n,
      tokenAddress: NFT_COLLECTION,
      tokenType: TokenType.ERC721,
      tokenSubID: tokenId,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange',
    }),
    /ERC721 spend amount must be 1/
  )
})

test('Identity isolation: ERC721 spend ignores ERC20 inputs sharing only the address', () => {
  const tokenId = `0x${'00'.repeat(31)}01`
  const inputs: Input[] = [
    makeERC20Input({
      commitmentIndex: 0n,
      treeNumber: 1n,
      value: 100n,
      tokenAddress: NFT_COLLECTION,
    }),
    makeNFTInput(tokenId, { commitmentIndex: 1n, treeNumber: 1n }),
  ]

  const solution = getSpendingSolution({
    recipientAddress: '0zkaddressNFTRecipient',
    inputs,
    amount: 1n,
    tokenAddress: NFT_COLLECTION,
    tokenType: TokenType.ERC721,
    tokenSubID: tokenId,
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
  })

  assert.ok(solution, 'Solution should be defined.')
  if (solution) {
    assert.equal(solution.inputs.length, 1)
    assert.equal(solution.inputs[0]?.tokenType, TokenType.ERC721, 'ERC20 input rejected by identity filter')
  }
})
