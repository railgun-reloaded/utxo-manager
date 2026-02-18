import {
  type SpendingSolutionInput,
  type OutputSolution,
  SpendingSolution,
  type Input,
} from "./models";
import {
  filterZeroUTXOs,
  groupInputsByTree,
  sortUTXOsByAscendingValue,
  sortUTXOsByDescendingValue,
} from "./solutions/utxos";
import { isValidInputOutputCount, MAX_INPUTS } from "./solutions/nullifiers";
import { selectInputsForTarget } from "./solutions/selection";

const pickBestSolution = (
  treeSolutions: OutputSolution[],
  solution: SpendingSolutionInput,
  preferHigherEfficiency: boolean,
): OutputSolution | undefined => {
  let bestSolution: OutputSolution | undefined;
  let bestEfficiency = preferHigherEfficiency ? 0 : Infinity;

  treeSolutions.forEach((treeSolution) => {
    const inputCount = treeSolution.inputs.length;
    const outputCount = treeSolution.outputs.length;
    const efficiency = inputCount / outputCount;

    const efficiencyCheck = preferHigherEfficiency
      ? efficiency > bestEfficiency
      : efficiency < bestEfficiency;

    if (efficiencyCheck) {
      bestEfficiency = efficiency;
      bestSolution = treeSolution;
      return;
    }

    if (efficiency === bestEfficiency && bestSolution) {
      const changeOutput = treeSolution.outputs.find(
        (output) => output.recipientAddress === solution.changeAddress,
      );
      const currentChange = changeOutput?.value || 0n;

      const bestChangeOutput = bestSolution.outputs.find(
        (output) => output.recipientAddress === solution.changeAddress,
      );
      const bestChange = bestChangeOutput?.value || 0n;

      if (currentChange > bestChange) {
        bestSolution = treeSolution;
      }
    }
  });

  return bestSolution;
};

const getSpendingSolution = (solution: SpendingSolutionInput): OutputSolution | undefined => {
  if (!solution.type) {
    solution.type = SpendingSolution.Simple;
  }

  if (solution.amount <= 0n) return undefined;

  const filteredInputs = filterZeroUTXOs(solution.inputs);
  if (filteredInputs.length === 0) return undefined;

  const sortFn =
    solution.type === SpendingSolution.Consolidation
      ? sortUTXOsByDescendingValue
      : sortUTXOsByAscendingValue;
  const preferHigherEfficiency = solution.type === SpendingSolution.Consolidation;

  const { availableTrees, sortedInputs } = groupInputsByTree(filteredInputs, sortFn);
  const treeSolutions: OutputSolution[] = [];

  Object.entries(sortedInputs).forEach(([treeNumber, treeInputs]) => {
    const treeValue = availableTrees[treeNumber] ?? 0n;
    if (treeValue < solution.amount) return;

    const selection = selectInputsForTarget(treeInputs, solution.amount, MAX_INPUTS);
    if (!selection) return;

    const outputs = [
      {
        value: solution.amount,
        recipientAddress: solution.recipientAddress,
      },
    ];

    const change = selection.total - solution.amount;
    if (change > 0n) {
      outputs.push({
        value: change,
        recipientAddress: solution.changeAddress,
      });
    }

    if (!isValidInputOutputCount(selection.inputs.length, outputs.length)) return;

    treeSolutions.push({
      inputs: selection.inputs,
      outputs,
    });
  });

  return pickBestSolution(treeSolutions, solution, preferHigherEfficiency);
};

export { getSpendingSolution, SpendingSolution };
export type { SpendingSolutionInput, Input };
