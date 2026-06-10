import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { SpendInput, SpendIntent } from '../src'
import { SpendingSolution, TokenType } from '../src'
import { calculateSolution } from '../src/solvers/railgun'

const ERC20_SUB_ID = `0x${'00'.repeat(32)}`
const NFT_COLLECTION = '0x858Df9F84C73E01c55A2DFB95825401242a65D64'

/**
 * Generate random token address.
 * @returns Token address
 */
const getRandomTokenAddress = () => '0x' + BigInt(Math.floor(Math.random() * 2 ** 23)).toString(16).padStart(40, '0')

/**
 * Generate random 0zk address.
 * @returns 0zk address
 */
const generateRandom0zkAddress = () => `0zkaddress${Math.random().toString(36).substring(2, 10)}`

/**
 * Build an ERC721 spend input for a specific token ID.
 * @param tokenSubID - 0x-prefixed token ID (32-byte hex).
 * @param overrides - Additional field overrides.
 * @returns An ERC721 `SpendInput` with `value: 1n`.
 */
const makeNFTSpendInput = (
  tokenSubID: string,
  overrides: Partial<SpendInput> = {}
): SpendInput => ({
  tokenAddress: NFT_COLLECTION,
  tokenType: TokenType.ERC721,
  tokenSubID,
  leafIndex: 0n,
  treeNumber: 1n,
  value: 1n,
  ...overrides,
})

/**
 * Create random ERC20 test inputs for the given token address.
 * @param count - Number of inputs
 * @param tokenAddress - Token address
 * @returns Test inputs
 */
const createRandomTestInputs = (count: number, tokenAddress: string): SpendInput[] => {
  const inputs: SpendInput[] = []
  for (let i = 0; i < count; i++) {
    inputs.push({
      tokenAddress,
      tokenType: TokenType.ERC20,
      tokenSubID: ERC20_SUB_ID,
      leafIndex: BigInt(i),
      treeNumber: BigInt(Math.floor(Math.random() * 16) + 1),
      value: BigInt(Math.floor(Math.random() * 5_000) + 1)
    })
  }
  return inputs
}

/**
 * Run random test cases.
 * @param count - Number of test cases
 * @param feeTokenDifferent - Whether fee token differs
 */
const runRandomTestCases = (count: number, feeTokenDifferent = false): void => {
  const inputs = []
  const tokenAddresses = []
  for (let t = 0; t < 5; t++) {
    const tokenAddress = getRandomTokenAddress()
    tokenAddresses.push(tokenAddress)
    const testInputs = createRandomTestInputs(100, tokenAddress)
    inputs.push(...testInputs)
  }

  const changeAddress = generateRandom0zkAddress() + 'CHANGE'
  const destination = generateRandom0zkAddress() + ''
  const feeRecipient = generateRandom0zkAddress() + 'FEE_RECIPIENT'

  for (let i = 0; i < count; i++) {
    const paymentToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)]
    const broadcastFeeToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)]

    const intent: SpendIntent = {
      type: SpendingSolution.Simple,
      changeAddress,
      recipients: [
        {
          tokenAddress: feeTokenDifferent ? broadcastFeeToken! : paymentToken!,
          tokenType: TokenType.ERC20,
          tokenSubID: ERC20_SUB_ID,
          railgunAddress: feeRecipient,
          amount: BigInt(Math.floor(Math.random() * 500) + 1),
        },
        {
          tokenAddress: paymentToken!,
          tokenType: TokenType.ERC20,
          tokenSubID: ERC20_SUB_ID,
          railgunAddress: destination,
          amount: BigInt(Math.floor(Math.random() * 50_000) + 1),
        },
      ]
    }
    calculateSolution(intent, inputs)
  }
}

test('Should generate valid solution for spendIntent', () => {
  runRandomTestCases(10)
})

test('Should generate valid solution for spendIntent with different feeToken', () => {
  runRandomTestCases(10, true)
})

test('RailgunSolver ERC721 happy path: single matching input, one output, no change', () => {
  const tokenId = `0x${'00'.repeat(31)}07`
  const utxos: SpendInput[] = [
    makeNFTSpendInput(tokenId, { leafIndex: 0n, treeNumber: 1n }),
    makeNFTSpendInput(`0x${'00'.repeat(31)}09`, { leafIndex: 1n, treeNumber: 1n }),
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
    recipients: [
      {
        tokenAddress: NFT_COLLECTION,
        tokenType: TokenType.ERC721,
        tokenSubID: tokenId,
        railgunAddress: '0zkaddressNFTRecipient',
        amount: 1n,
      },
    ],
  }

  const solutions = calculateSolution(intent, utxos)
  assert.equal(solutions.length, 1, 'one tree solution')
  const treeOutput = solutions[0]
  assert.ok(treeOutput)
  if (treeOutput) {
    assert.equal(treeOutput.inputs.length, 1, 'one input')
    assert.equal(treeOutput.inputs[0]?.tokenSubID, tokenId, 'matched the requested token ID')
    assert.equal(treeOutput.outputs.length, 1, 'no change output for ERC721')
    assert.equal(treeOutput.outputs[0]?.value, 1n)
  }
})

test('RailgunSolver two-NFT batch: two distinct token IDs produce two independent solutions', () => {
  const idA = `0x${'00'.repeat(31)}01`
  const idB = `0x${'00'.repeat(31)}02`
  const utxos: SpendInput[] = [
    makeNFTSpendInput(idA, { leafIndex: 0n, treeNumber: 1n }),
    makeNFTSpendInput(idB, { leafIndex: 1n, treeNumber: 1n }),
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
    recipients: [
      {
        tokenAddress: NFT_COLLECTION,
        tokenType: TokenType.ERC721,
        tokenSubID: idA,
        railgunAddress: '0zkaddressRecipientA',
        amount: 1n,
      },
      {
        tokenAddress: NFT_COLLECTION,
        tokenType: TokenType.ERC721,
        tokenSubID: idB,
        railgunAddress: '0zkaddressRecipientB',
        amount: 1n,
      },
    ],
  }

  const solutions = calculateSolution(intent, utxos)
  assert.equal(solutions.length, 2, 'one solution per NFT identity')
  const subIDs = solutions.map(s => s.inputs[0]?.tokenSubID).sort()
  assert.deepEqual(subIDs, [idA, idB].sort(), 'both NFTs spent')
  for (const sol of solutions) {
    assert.equal(sol.inputs.length, 1)
    assert.equal(sol.outputs.length, 1, 'no change output')
  }
})

test('RailgunSolver ERC721 unowned: solution is filtered out and result excludes the missing NFT', () => {
  const ownedId = `0x${'00'.repeat(31)}01`
  const unownedId = `0x${'00'.repeat(31)}99`
  const utxos: SpendInput[] = [
    makeNFTSpendInput(ownedId, { leafIndex: 0n, treeNumber: 1n }),
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress: '0zkaddressChange',
    recipients: [
      {
        tokenAddress: NFT_COLLECTION,
        tokenType: TokenType.ERC721,
        tokenSubID: unownedId,
        railgunAddress: '0zkaddressRecipient',
        amount: 1n,
      },
    ],
  }

  assert.throws(
    () => calculateSolution(intent, utxos),
    (err: unknown) => {
      assert.ok(err instanceof Error)
      assert.match(err.message, /NFT not owned or already spent/)
      assert.match(err.message, new RegExp(NFT_COLLECTION))
      assert.match(err.message, new RegExp(unownedId))
      return true
    }
  )
})
