import { type SpendingSolutionInput, type OutputSolution, SpendingSolution, type Input } from "./models"

const getSpendingSolution = (
  solution: SpendingSolutionInput
): OutputSolution => {

  // default spending solution is
  if (!solution.type) {
    solution.type = SpendingSolution.Simple
  }

  // calculate the shortest path based on the desired amount.
  const desiredAmount = solution.amount;
  // sort inputs by tree, we can only spend off of a single tree at a time 
  // this does not mean we cannot create a tx of X value on one tree[a], and a tx of Y value on tree[b] where [txA, txB] = sum of X+Y to recipient. 
  // its not that we cant spend them at all, its just in a singular 'railgun' transaction, 
  // nothing is preventing us from creating a tx-batch that spends across both trees that fulfils the same amount, 
  // the recipient will just recieve N + treesSpentFrom commitments. 
  // subsequently they are able to then either consolidate or spend normally; as they will be within the same tree. 
  const { inputs } = solution;

  const sortedInputs: Record<string, Input[]> = {};
  const availableTrees: Record<string, bigint> = {};
  inputs.forEach(i => {
    const { treeNumber } = i;
    const tnf = treeNumber.toString(10);
    availableTrees[tnf] ??= 0n;
    availableTrees[tnf]! += i.value;

    sortedInputs[tnf] ??= []
    sortedInputs[tnf]?.push(i)
  })

  const treeSolutions: Record<string, OutputSolution> = {};

  Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
    let treeAmountFilled = 0n;
    const treeOutput: OutputSolution = {
      inputs: [],
      outputs: [],
    };
    while (treeAmountFilled < desiredAmount && treeInputs.length > 0) {
      const input = treeInputs.pop();
      if (!input) {
        throw new Error(`No more input UTXO in tree ${treeNumber}, solution not found.`);
      }
      treeAmountFilled += input.value;
      treeOutput.inputs.push(input);
    }

    const solutionOutput = {
      value: desiredAmount,
      recipientAddress: solution.recipientAddress,
    };
    treeOutput.outputs.push(solutionOutput);

    const change = treeAmountFilled - desiredAmount;
    if (change > 0n) {
      const changeOutput = {
        value: change,
        recipientAddress: solution.changeAddress,
      };
      treeOutput.outputs.push(changeOutput);
      treeSolutions[treeNumber] = treeOutput;
    }

  });

  // need to now select the most 'economical' solution, 
  let bestSolution: OutputSolution | null = null;
  let bestEfficiency = solution.type === SpendingSolution.Consolidation ? 0 : Infinity;

  Object.values(treeSolutions).forEach((treeSolution) => {
    const inputCount = treeSolution.inputs.length;
    const outputCount = treeSolution.outputs.length;

    // Calculate efficiency as the ratio of inputs to outputs
    const efficiency = inputCount / outputCount;
    // Prefer solutions with fewer inputs and outputs
    const efficiencyCheck = solution.type == SpendingSolution.Consolidation ?
      efficiency > bestEfficiency :
      efficiency < bestEfficiency;

    if (efficiencyCheck) {
      bestEfficiency = efficiency;
      bestSolution = treeSolution;
    } else if (efficiency === bestEfficiency) {
      // If efficiency is the same, prefer solutions with larger change outputs
      const changeOutput = treeSolution.outputs.find(
        (output) => output.recipientAddress === solution.changeAddress
      );
      const currentChange = changeOutput?.value || 0n;

      const bestChangeOutput = bestSolution?.outputs.find(
        (output) => output.recipientAddress === solution.changeAddress
      );
      const bestChange = bestChangeOutput?.value || 0n;

      if (currentChange > bestChange) {
        bestSolution = treeSolution;
      }
    }
  });
  if (!bestSolution) {
    // @ts-expect-error
    return undefined;
  }
  return bestSolution;
}

export { getSpendingSolution, SpendingSolution }
export type { SpendingSolutionInput, Input }