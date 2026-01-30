import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSpendingSolution, SpendingSolution, type Input, type SpendingSolutionInput } from '../src/index'

function createRandomTestInputs(count: number): Input[] {
  const inputs: Input[] = [];
  for (let i = 0; i < count; i++) {
    inputs.push({
      commitmentIndex: BigInt(i),
      treeNumber: BigInt(Math.floor(Math.random() * 16)),
      value: BigInt(Math.floor(Math.random() * 10000) + 1)
    });
  }
  return inputs;
}

function validateRandomTestCase(desiredSolution: SpendingSolutionInput, solution: ReturnType<typeof getSpendingSolution>): void {
  // console.log("Desired Amount", desiredSolution.amount);
  // console.log('Generated Solution:', solution);
  // validate inputs
  assert(solution.inputs.length > 0, "Solution should include inputs.");
  assert(solution.outputs.length == 2, "Solution Simple: should include 2 outputs.");

  // validate outputs
  let totalOutputValue = 0n;
  solution.outputs.forEach((output) => {
    totalOutputValue += output.value;
  });

  assert(totalOutputValue >= desiredSolution.amount, "Solution amount should match or exceed desired amount.");
  assert(solution.outputs.some(output => output.recipientAddress === desiredSolution.recipientAddress), "Solution should include the recipient address.");
}

function runRandomTestCases(testCaseCount: number): void {
  for (let i = 0; i < testCaseCount; i++) {
    const testInputs = createRandomTestInputs(100);
    const changeAddress = `0zkaddress${Math.random().toString(36).substring(2, 10)}CHANGE`;
    const desiredSolution: SpendingSolutionInput = {
      recipientAddress: `0zkaddress${Math.random().toString(36).substring(2, 10)}`,
      inputs: testInputs,
      amount: BigInt(Math.floor(Math.random() * 20_000) + 1),
      type: SpendingSolution.Simple,
      changeAddress
    };

    const solution = getSpendingSolution(desiredSolution);
    validateRandomTestCase(desiredSolution, solution);
  }
}




describe("UTXO-Spending Solution", () => {
  it("Should pass all randomized test cases.", () => {
    runRandomTestCases(32);
  });

  it("Should generate a valid solution for random inputs.", () => {
    const testInputs = createRandomTestInputs(5);
    const desiredSolution: SpendingSolutionInput = {
      recipientAddress: '0zkaddressRandom',
      inputs: testInputs,
      amount: 500n,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange'
    };

    const solution = getSpendingSolution(desiredSolution);
    // console.log('Generated Solution:', solution);

    assert(solution.inputs.length > 0, "Solution should include inputs.");
    // get map amount
    let amount = 0n;
    solution.outputs.forEach((acc) => {
      amount += acc.value;
    });
    // console.log(amount, desiredSolution)
    assert(amount >= desiredSolution.amount, "Solution amount should match desired amount.");
  });

  it("Should handle edge cases with no inputs.", () => {
    const desiredSolution: SpendingSolutionInput = {
      recipientAddress: '0zkaddressEdgeCase',
      inputs: [],
      amount: 0n,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange',

    };

    const solution = getSpendingSolution(desiredSolution);
    console.log('Edge Case Solution:', solution);
    assert(solution === undefined, "Solution should be undefined.")
  });

  it("Should handle large input values.", () => {
    const testInputs: Input[] = [
      { commitmentIndex: 0n, treeNumber: 0n, value: 10_000n },
      { commitmentIndex: 1n, treeNumber: 0n, value: 20_000n },
    ];

    const desiredSolution: SpendingSolutionInput = {
      recipientAddress: '0zkaddressLargeValues',
      inputs: testInputs,
      amount: 25_000n,
      type: SpendingSolution.Simple,
      changeAddress: '0zkaddressChange',

    };

    const solution = getSpendingSolution(desiredSolution);
    // console.log('Large Values Solution:', solution);

    assert(solution.inputs.length > 0, "Solution should include inputs.");
    // assert(solution.outputs[0]?.value === desiredSolution.amount, "Solution amount should match desired amount.");
  });

});