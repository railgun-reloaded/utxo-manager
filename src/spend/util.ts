import { SpendingSolution } from "../models";
import type {
  BadSpendOutput,
  SpendInput,
  SpendIntent,
  SpendTreeOutput,
  SpendTreeSolutions,
} from "./models";
import {
  calculateTotalSpend,
  filterZeroUTXOs,
  groupInputsByTree,
  sortUTXOsByAscendingValue,
  sortUTXOsByDescendingValue,
} from "../solutions/utxos";
import { findMaxInputsForOutputs, isValidInputOutputCount } from "../solutions/nullifiers";

const sortUTXOASC = sortUTXOsByAscendingValue;
const sortUTXODESC = sortUTXOsByDescendingValue;

const getTreeInputs = (inputs: SpendInput[], type: SpendingSolution) => {
  const compareFunction =
    type === SpendingSolution.Consolidation ? sortUTXODESC : sortUTXOASC;
  return groupInputsByTree(inputs, compareFunction);
};

const getEfficentSolution = (
  treeSolutions: SpendTreeSolutions,
  intent: SpendIntent,
): SpendTreeOutput | BadSpendOutput => {
  let bestSolution: SpendTreeOutput | null = null;
  let bestEfficiency = intent.type === SpendingSolution.Consolidation ? 0 : Infinity;

  Object.values(treeSolutions).forEach((treeSolution) => {
    const inputCount = treeSolution.inputs.length;
    const outputCount = treeSolution.outputs.length;

    if (!isValidInputOutputCount(inputCount, outputCount)) return;

    const efficiency = inputCount / outputCount;
    const efficiencyCheck =
      intent.type === SpendingSolution.Consolidation
        ? efficiency > bestEfficiency
        : efficiency < bestEfficiency;

    if (efficiencyCheck) {
      bestEfficiency = efficiency;
      bestSolution = treeSolution;
      return;
    }

    if (efficiency === bestEfficiency && bestSolution) {
      const changeOutput = treeSolution.outputs.find(
        (output) => output.railgunAddress === intent.changeAddress,
      );
      const currentChange = changeOutput?.value || 0n;

      const bestChangeOutput = bestSolution.outputs.find(
        (output) => output.railgunAddress === intent.changeAddress,
      );
      const bestChange = bestChangeOutput?.value || 0n;

      if (currentChange > bestChange) {
        bestSolution = treeSolution;
      }
    }
  });

  if (!bestSolution) {
    return { error: true, intent };
  }
  return bestSolution;
};

const isValidSolution = (inputs: number, outputs: number) =>
  isValidInputOutputCount(inputs, outputs);

const findMaxInputs = (outputs: number): number => findMaxInputsForOutputs(outputs);

export {
  calculateTotalSpend,
  filterZeroUTXOs,
  sortUTXOASC,
  sortUTXODESC,
  isValidSolution,
  findMaxInputs,
  getTreeInputs,
  getEfficentSolution,
};
