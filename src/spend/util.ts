import { SpendingSolution } from "../models";
import type { BadSpendOutput, SpendInput, SpendIntent, SpendTreeOutput, SpendTreeSolutions } from "./models";

const calculateTotalSpend = (utxos: SpendInput[]): bigint => {
  return utxos.reduce((left, right) => left + right.value, 0n);
}

const filterZeroUTXOs = (utxos: SpendInput[]): SpendInput[] => {
  return utxos.filter((utxo) => utxo.value !== 0n);
};

const sortUTXOASC =
  (left: SpendInput, right: SpendInput) => {
    if (left.value > right.value) return 1;
    if (left.value < right.value) return -1;
    return 0;
    // })
  }
//  (utxos: SpendInput[]): void => {
//   utxos.sort((left, right) => {
//     if (left.value < right.value) return -1;
//     if (left.value > right.value) return 1;
//     return 0;
//   })
// }

const sortUTXODESC =
  // (utxos: SpendInput[]): void => {
  // utxos.sort(
  (left: SpendInput, right: SpendInput) => {
    if (left.value < right.value) return 1;
    if (left.value > right.value) return -1;
    return 0;
    // })
  }

const getTreeInputs = (inputs: SpendInput[], type: SpendingSolution) => {
  const sortedInputs: Record<string, SpendInput[]> = {};
  const trees: Record<string, bigint> = {};
  inputs.forEach(i => {
    const treeNumber = i.treeNumber.toString(10);
    trees[treeNumber] ??= 0n;
    trees[treeNumber]! += i.value;
    sortedInputs[treeNumber] ??= []
    sortedInputs[treeNumber]?.push(i);
  })
  Object.values(sortedInputs).forEach((treeInputs) => {

    const compareFunction = type == SpendingSolution.Consolidation ? sortUTXODESC : sortUTXOASC
    treeInputs.sort(compareFunction)
  })
  // sort inputs here based on SpendingSolution
  return {
    availableTrees: trees,
    sortedInputs
  }
}

const getEfficentSolution = (treeSolutions: SpendTreeSolutions, intent: SpendIntent): SpendTreeOutput | BadSpendOutput => {
  let bestSolution: SpendTreeOutput | null = null;
  let bestEfficiency = intent.type === SpendingSolution.Consolidation ? 0 : Infinity;



  Object.values(treeSolutions).forEach((treeSolution) => {
    const inputCount = treeSolution.inputs.length;
    const outputCount = treeSolution.outputs.length;

    // validate input output counts
    if (isValidSolution(inputCount, outputCount)) {
      // throw new Error("We have invalid solution...")

      // Calculate efficiency as the ratio of inputs to outputs
      const efficiency = inputCount / outputCount;
      // Prefer solutions with fewer inputs and outputs
      const efficiencyCheck = intent.type == SpendingSolution.Consolidation ?
        efficiency > bestEfficiency :
        efficiency < bestEfficiency;

      if (efficiencyCheck) {
        bestEfficiency = efficiency;
        bestSolution = treeSolution;
      } else if (efficiency === bestEfficiency) {
        // If efficiency is the same, prefer solutions with larger change outputs
        const changeOutput = treeSolution.outputs.find(
          (output) => output.railgunAddress === intent.changeAddress
        );
        const currentChange = changeOutput?.value || 0n;

        const bestChangeOutput = bestSolution?.outputs.find(
          (output) => output.railgunAddress === intent.changeAddress
        );
        const bestChange = bestChangeOutput?.value || 0n;

        if (currentChange > bestChange) {
          bestSolution = treeSolution;
        }
      }
    }
  });
  if (!bestSolution) {
    const badSolutionOutput: BadSpendOutput = {
      error: true,
      intent
    }
    return badSolutionOutput;
  }
  return bestSolution;
}


const isValidSolution = (inputs: number, outputs: number) => inputs + outputs <= 14;

// desired outputs are known from the start, we can choose to increase 'spending complexity' based on inability to compute 
// viable spending solution
const findMaxInputs = (outputs: number): number => 14 - outputs;

export {
  calculateTotalSpend,
  filterZeroUTXOs,
  sortUTXOASC,
  sortUTXODESC,
  isValidSolution,
  findMaxInputs,
  getTreeInputs,
  getEfficentSolution
}