import test from 'brittle'

import { SpendingSolution } from '../src'
import type { SpendInput, SpendIntent } from '../src/spend'
import { calculateSolution } from '../src/spend/solution'

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
 * Create random test inputs.
 * @param count - Number of inputs
 * @param tokenAddress - Token address
 * @returns Test inputs
 */
const createRandomTestInputs = (count: number, tokenAddress: string): SpendInput[] => {
  const inputs: SpendInput[] = []
  // for (let t = 0; t < 16; t++)
  for (let i = 0; i < count; i++) {
    inputs.push({
      tokenAddress,
      leafIndex: BigInt(i),
      // treeNumber: BigInt(t),
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
    // for (let i = 0; i < count; i++) {
    inputs.push(...testInputs)
    // }
  }

  // now we go through the cases.
  const changeAddress = generateRandom0zkAddress() + 'CHANGE'
  const destination = generateRandom0zkAddress() + ''
  const feeRecipient = generateRandom0zkAddress() + 'FEE_RECIPIENT'

  for (let i = 0; i < count; i++) {
    // select payment token, and broadcast-fee token, could be the same.
    const paymentToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)]
    // simulate as same for now.
    const broadcastFeeToken = tokenAddresses[Math.floor(Math.random() * tokenAddresses.length)]

    const intent: SpendIntent = {
      type: SpendingSolution.Simple,
      changeAddress,
      recipients: [
        // broadcast fee is always first in the expendature
        {
          tokenAddress: feeTokenDifferent ? broadcastFeeToken! : paymentToken!,
          railgunAddress: feeRecipient,
          amount: BigInt(Math.floor(Math.random() * 500) + 1),
        },
        {
          tokenAddress: paymentToken!,
          railgunAddress: destination,
          amount: BigInt(Math.floor(Math.random() * 50_000) + 1),
        },
      ]
    }
    calculateSolution(intent, inputs)
  }
}

test('Should generate valid solution for spendIntent', () => {
  // const randomToken = getRandomTokenAddress();
  // const inputs = createRandomTestInputs(10, randomToken);
  runRandomTestCases(10)
  // console.log(inputs)
})

test('Should generate valid solution for spendIntent with different feeToken', () => {
  // const randomToken = getRandomTokenAddress();
  // const inputs = createRandomTestInputs(10, randomToken);
  runRandomTestCases(10, true)
  // console.log(inputs)
})

test('Should handle multi-transaction scenario with >10 UTXOs', (t) => {
  const tokenAddress = getRandomTokenAddress()
  const changeAddress = generateRandom0zkAddress() + 'CHANGE'
  const recipient = generateRandom0zkAddress() + 'RECIPIENT'

  // Create 15 UTXOs, each worth 10, all from the same tree
  const inputs: SpendInput[] = Array.from({ length: 15 }, (_, i) => ({
    tokenAddress,
    leafIndex: BigInt(i),
    treeNumber: 0n,
    value: 10n
  }))

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [
      {
        tokenAddress,
        railgunAddress: recipient,
        amount: 150n // Requires all 15 UTXOs
      }
    ]
  }

  const solutions = calculateSolution(intent, inputs)

  t.ok(solutions.length > 0, 'Should generate solutions')
  t.ok(solutions.length >= 2, 'Should generate multiple SpendTreeOutput for >10 inputs')

  // Verify total inputs across all solutions
  const totalInputs = solutions.reduce((sum, sol) => sum + sol.inputs.length, 0)
  t.is(totalInputs, 15, 'Should use all 15 UTXOs')

  // Verify each solution has ≤10 inputs
  solutions.forEach((sol, idx) => {
    t.ok(sol.inputs.length <= 10, `Solution ${idx} should have ≤10 inputs`)
  })

  // Verify outputs are distributed across solutions
  let totalRecipientValue = 0n
  solutions.forEach((sol, idx) => {
    t.ok(sol.outputs.length > 0, `Solution ${idx} should have outputs`)
    const recipientOutput = sol.outputs.find(o => o.railgunAddress === recipient)
    if (recipientOutput) {
      totalRecipientValue += recipientOutput.value
    }
  })

  t.is(totalRecipientValue, 150n, 'Total recipient value across all solutions should be 150n')
})

test('Should handle multi-transaction scenario across multiple trees', (t) => {
  const tokenAddress = getRandomTokenAddress()
  const changeAddress = generateRandom0zkAddress() + 'CHANGE'
  const recipient = generateRandom0zkAddress() + 'RECIPIENT'

  // Create 25 UTXOs across 3 different trees
  const inputs: SpendInput[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      tokenAddress,
      leafIndex: BigInt(i),
      treeNumber: 0n,
      value: 10n
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      tokenAddress,
      leafIndex: BigInt(i),
      treeNumber: 1n,
      value: 10n
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      tokenAddress,
      leafIndex: BigInt(i),
      treeNumber: 2n,
      value: 10n
    }))
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [
      {
        tokenAddress,
        railgunAddress: recipient,
        amount: 250n // Requires all 25 UTXOs
      }
    ]
  }

  const solutions = calculateSolution(intent, inputs)

  t.ok(solutions.length > 0, 'Should generate solutions')
  t.ok(solutions.length >= 3, 'Should generate multiple SpendTreeOutput for cross-tree scenario')

  // Verify total value covered
  const totalValue = solutions.reduce((sum, sol) => {
    return sum + sol.inputs.reduce((s, inp) => s + inp.value, 0n)
  }, 0n)
  t.ok(totalValue >= 250n, 'Should cover target amount')

  // Verify each batch is from a single tree
  solutions.forEach((sol, idx) => {
    const treeNumbers = new Set(sol.inputs.map(inp => inp.treeNumber))
    t.is(treeNumbers.size, 1, `Solution ${idx} should have inputs from single tree`)
  })
})
