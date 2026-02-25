import test from 'brittle'

import { SpendingSolution } from '../src'
import type { SpendInput, SpendIntent } from '../src/spend'
import { calculateSolution } from '../src/spend/solution'

/**
 * Demo test showing optimization improvements from SDK-168.
 *
 * Before optimization: Greedy selection would accumulate small UTXOs
 * After optimization: Selects the most efficient single UTXO
 */

test('Optimization demo: Spec example - prefers single 100n UTXO', (t) => {
  const tokenAddress = '0x' + '1'.repeat(40)
  const changeAddress = '0zkCHANGE'
  const recipient = '0zkRECIPIENT'

  // Tree has UTXOs [100, 50, 30, 20, 10, 5, 5]
  // Target = 100
  const inputs: SpendInput[] = [
    { tokenAddress, leafIndex: 0n, treeNumber: 0n, value: 100n },
    { tokenAddress, leafIndex: 1n, treeNumber: 0n, value: 50n },
    { tokenAddress, leafIndex: 2n, treeNumber: 0n, value: 30n },
    { tokenAddress, leafIndex: 3n, treeNumber: 0n, value: 20n },
    { tokenAddress, leafIndex: 4n, treeNumber: 0n, value: 10n },
    { tokenAddress, leafIndex: 5n, treeNumber: 0n, value: 5n },
    { tokenAddress, leafIndex: 6n, treeNumber: 0n, value: 5n }
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [{ tokenAddress, railgunAddress: recipient, amount: 100n }]
  }

  const solutions = calculateSolution(intent, inputs)

  t.is(solutions.length, 1, 'Should find single solution')

  // OPTIMIZATION: Should use 1 input (the 100n UTXO)
  // Old greedy behavior would use 5 + 5 + 10 + 20 + 30 + 50 = 120 (6 inputs, 20 change)
  t.is(solutions[0]!.inputs.length, 1, 'Should use only 1 input (optimal!)')
  t.is(solutions[0]!.inputs[0]!.value, 100n, 'Should select the 100n UTXO')

  // Exact match: no change needed
  const recipientOutput = solutions[0]!.outputs.find(o => o.railgunAddress === recipient)
  t.is(recipientOutput?.value, 100n, 'Should send exactly 100n to recipient')
  t.is(solutions[0]!.outputs.length, 1, 'Should have no change output (exact match)')
})

test('Optimization demo: Minimizes change', (t) => {
  const tokenAddress = '0x' + '2'.repeat(40)
  const changeAddress = '0zkCHANGE'
  const recipient = '0zkRECIPIENT'

  // Tree has UTXOs [105, 200]
  // Target = 100
  const inputs: SpendInput[] = [
    { tokenAddress, leafIndex: 0n, treeNumber: 0n, value: 105n },
    { tokenAddress, leafIndex: 1n, treeNumber: 0n, value: 200n }
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [{ tokenAddress, railgunAddress: recipient, amount: 100n }]
  }

  const solutions = calculateSolution(intent, inputs)

  t.is(solutions.length, 1, 'Should find single solution')
  t.is(solutions[0]!.inputs.length, 1, 'Should use 1 input')

  // OPTIMIZATION: Should prefer 105 (5 change) over 200 (100 change)
  t.is(solutions[0]!.inputs[0]!.value, 105n, 'Should select 105n UTXO (minimizes change)')

  const changeOutput = solutions[0]!.outputs.find(o => o.railgunAddress === changeAddress)
  t.is(changeOutput?.value, 5n, 'Should have only 5n change')
})

test('Optimization demo: Minimizes input count', (t) => {
  const tokenAddress = '0x' + '3'.repeat(40)
  const changeAddress = '0zkCHANGE'
  const recipient = '0zkRECIPIENT'

  // Tree has UTXOs [60, 40, 10, 10, 10, 10, 10]
  // Target = 100
  const inputs: SpendInput[] = [
    { tokenAddress, leafIndex: 0n, treeNumber: 0n, value: 60n },
    { tokenAddress, leafIndex: 1n, treeNumber: 0n, value: 40n },
    { tokenAddress, leafIndex: 2n, treeNumber: 0n, value: 10n },
    { tokenAddress, leafIndex: 3n, treeNumber: 0n, value: 10n },
    { tokenAddress, leafIndex: 4n, treeNumber: 0n, value: 10n },
    { tokenAddress, leafIndex: 5n, treeNumber: 0n, value: 10n },
    { tokenAddress, leafIndex: 6n, treeNumber: 0n, value: 10n }
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [{ tokenAddress, railgunAddress: recipient, amount: 100n }]
  }

  const solutions = calculateSolution(intent, inputs)

  t.is(solutions.length, 1, 'Should find single solution')

  // OPTIMIZATION: Should use 60 + 40 = 100 (2 inputs, exact)
  // Instead of 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 = 100 (10 inputs)
  t.is(solutions[0]!.inputs.length, 2, 'Should use only 2 inputs')
  t.is(solutions[0]!.outputs.length, 1, 'Should have no change (exact match)')

  const totalValue = solutions[0]!.inputs.reduce((sum, i) => sum + i.value, 0n)
  t.is(totalValue, 100n, 'Should total exactly 100n')
})

test('Optimization demo: Exact match beats lower input with change', (t) => {
  const tokenAddress = '0x' + '4'.repeat(40)
  const changeAddress = '0zkCHANGE'
  const recipient = '0zkRECIPIENT'

  // Tree has UTXOs [110, 50, 50]
  // Target = 100
  const inputs: SpendInput[] = [
    { tokenAddress, leafIndex: 0n, treeNumber: 0n, value: 110n },
    { tokenAddress, leafIndex: 1n, treeNumber: 0n, value: 50n },
    { tokenAddress, leafIndex: 2n, treeNumber: 0n, value: 50n }
  ]

  const intent: SpendIntent = {
    type: SpendingSolution.Simple,
    changeAddress,
    recipients: [{ tokenAddress, railgunAddress: recipient, amount: 100n }]
  }

  const solutions = calculateSolution(intent, inputs)

  t.is(solutions.length, 1, 'Should find single solution')

  // OPTIMIZATION: Should prefer 50 + 50 = 100 (exact) over 110 (10 change)
  // Even though 110 is 1 input vs 2 inputs, exact match takes priority
  t.is(solutions[0]!.inputs.length, 2, 'Should use 2 inputs for exact match')
  t.is(solutions[0]!.outputs.length, 1, 'Should have no change output')

  const totalValue = solutions[0]!.inputs.reduce((sum, i) => sum + i.value, 0n)
  t.is(totalValue, 100n, 'Should be exact match')
})
